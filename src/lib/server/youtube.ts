// YouTube search + audio grab for the admin music library.
//
// Search is yt-search (plain HTTPS scrape, no API key). The download leg is a
// yt-dlp SUBPROCESS piped through ffmpeg — deliberately not a JS downloader
// library: @distube/ytdl-core cannot even be imported under Bun (its cookie
// agent needs undici Agent.compose, which Bun's built-in undici lacks), and
// youtubei.js gets 403s from googlevideo without the PoToken machinery. yt-dlp
// is the one tool that keeps up with YouTube's countermeasures, and a
// subprocess behaves identically under Bun and Node.
//
// System requirements, both in the runtime image and on a dev machine:
//   ffmpeg  — transcode to mp3 (fluent-ffmpeg drives the binary)
//   yt-dlp  — resolve + stream the audio
//
// Two things break grabs in production, and both are configuration rather than
// code:
//
//   1. A STALE yt-dlp. YouTube reshuffles its player every few weeks and an old
//      extractor gets refused. The image pins an upstream release — see the
//      YTDLP_VERSION note in the Dockerfile — precisely so this is a one-line
//      bump instead of a mystery.
//   2. The SERVER'S IP. YouTube treats datacentre ranges as suspicious, and an
//      EC2 box sits in one, so it answers "Sign in to confirm you're not a
//      bot" to requests that succeed from a laptop. Nothing in the code can
//      argue with that; only a signed-in cookie jar (or an off-datacentre
//      proxy) can. Hence the env knobs below, all optional:
//
//        YTDLP_COOKIES_B64    base64 of a Netscape cookies.txt — base64 because
//                             the instance passes env through docker
//                             --env-file, which is strictly one line per value
//        YTDLP_COOKIES_FILE   path to a jar already on disk, if you would
//                             rather mount one than carry it in SSM
//        YTDLP_PROXY          proxy URL, for when the IP is the whole problem
//        YTDLP_PLAYER_CLIENTS --extractor-args youtube:player_client=… , the
//                             usual first thing upstream suggests trying
//
// The mp3 lands in object storage through the SAME uploadObject() the admin
// uploader uses — same songs/ folder, same size ceiling, same key shape — and
// only the returned URL reaches the database, like every other upload.

import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import ffmpeg from 'fluent-ffmpeg';
import ytSearch from 'yt-search';
import { uploadObject, type UploadResult } from './s3';

/**
 * Longest video a grab accepts. At 192 kbps this lands ~21 MB, safely under
 * MAX_AUDIO_BYTES (24 MB) — uploadObject would reject the file anyway, but
 * failing before a multi-minute download is the polite version.
 */
export const MAX_GRAB_SECONDS = 15 * 60;

/** What the search page renders per result. Plain data, serialisable as-is. */
export type VideoHit = {
	videoId: string;
	title: string;
	description: string;
	url: string;
	thumbnail: string;
	channel: string;
	/** "3:05" — already formatted by yt-search. */
	duration: string;
	seconds: number;
	ago: string;
	views: number;
};

export async function searchVideos(query: string, limit = 12): Promise<VideoHit[]> {
	const res = await ytSearch(query);
	return res.videos.slice(0, limit).map((v) => ({
		videoId: v.videoId,
		title: v.title,
		description: v.description,
		url: v.url,
		// yt-search omits the thumbnail on the odd result; the id-derived URL is
		// the same image and always resolves, so there is no broken-tile state.
		thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
		channel: v.author?.name ?? '',
		duration: v.timestamp,
		seconds: v.seconds,
		ago: v.ago,
		views: v.views
	}));
}

/** Authoritative metadata for one video — the grab re-reads it server-side
 *  rather than trusting hidden form inputs. */
export async function videoMeta(videoId: string) {
	const v = await ytSearch({ videoId });
	return {
		videoId: v.videoId,
		title: v.title,
		url: v.url,
		channel: v.author?.name ?? '',
		seconds: v.seconds,
		duration: v.timestamp
	};
}

/**
 * Split a video title into artist/title the way music uploads name themselves.
 *
 * "Artist - Title" is the convention; when it isn't followed the channel name
 * stands in as the artist, minus the " - Topic" suffix YouTube's auto-generated
 * music channels carry. Bracketed noise like "(Official Video)" is dropped —
 * it is presentation, not part of the song's name.
 */
export function splitTitle(raw: string, channel: string): { title: string; artist: string } {
	const cleaned = raw
		.replace(
			/[([](official\s+(music\s+)?(video|audio)|lyric(s)?(\s+video)?|visuali[sz]er|hd|4k)[)\]]/gi,
			''
		)
		.replace(/\s{2,}/g, ' ')
		.trim();

	const dash = cleaned.split(/\s+[-–—]\s+/);
	if (dash.length >= 2) {
		return { artist: dash[0].trim(), title: dash.slice(1).join(' - ').trim() };
	}
	return { title: cleaned, artist: channel.replace(/\s+-\s+topic$/i, '').trim() };
}

/** Only a real YouTube id reaches the shell arguments. */
export function isVideoId(value: string): boolean {
	return /^[A-Za-z0-9_-]{11}$/.test(value);
}

/**
 * Copy a video's thumbnail into our own bucket.
 *
 * Hotlinking i.ytimg.com would put a YouTube host in the PUBLIC page's CSP and
 * leave the cover art dependent on a URL we do not control. Copying the bytes
 * once, at grab time, keeps the landing page self-hosted like every other
 * image the site serves.
 *
 * Resolutions are tried best-first: maxres exists only for videos uploaded
 * with a large enough thumbnail, and YouTube answers a missing one with 404
 * (or, historically, a 120x90 placeholder — hence checking the size too).
 * Returns null rather than throwing: cover art is a nicety, and losing it must
 * not cost the track.
 */
async function grabThumbnail(videoId: string): Promise<string | null> {
	for (const name of ['maxresdefault', 'hqdefault', 'mqdefault']) {
		try {
			const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${name}.jpg`);
			if (!res.ok) continue;
			const bytes = new Uint8Array(await res.arrayBuffer());
			// YouTube's "no such thumbnail" placeholder is a tiny grey image.
			if (bytes.byteLength < 2048) continue;
			const file = new File([bytes], `${videoId}.jpg`, { type: 'image/jpeg' });
			const stored = await uploadObject(file, 'songs');
			return stored.url;
		} catch {
			// try the next resolution
		}
	}
	return null;
}

/**
 * A cookie jar for yt-dlp, if one is configured.
 *
 * A mounted path is used as-is. The base64 form is decoded into a private temp
 * file for the length of one grab and deleted afterwards — cookies are live
 * credentials for a Google account, so they never sit on disk longer than the
 * download that needs them, and never with a mode anyone else can read.
 */
async function cookieJar(): Promise<{ path: string; dispose: () => Promise<void> } | null> {
	if (env.YTDLP_COOKIES_FILE) {
		return { path: env.YTDLP_COOKIES_FILE, dispose: async () => void 0 };
	}

	const encoded = env.YTDLP_COOKIES_B64?.trim();
	if (!encoded) return null;

	const path = join(tmpdir(), `ytc-${crypto.randomUUID().slice(0, 8)}.txt`);
	await writeFile(path, Buffer.from(encoded, 'base64'), { mode: 0o600 });
	return { path, dispose: () => unlink(path).catch(() => void 0) };
}

/** The argument list for one grab: fixed flags first, configured ones after. */
function ytdlpArgs(videoId: string, cookies: string | null): string[] {
	const args = [
		'-f',
		'bestaudio/best',
		'--no-playlist',
		// The media goes to stdout, so yt-dlp's progress bar goes to stderr —
		// where it would flood the tail we keep and evict the one ERROR line
		// that explains a failure.
		'--no-progress',
		'-o',
		'-'
	];

	if (cookies) args.push('--cookies', cookies);
	if (env.YTDLP_PROXY) args.push('--proxy', env.YTDLP_PROXY);
	if (env.YTDLP_PLAYER_CLIENTS)
		args.push('--extractor-args', `youtube:player_client=${env.YTDLP_PLAYER_CLIENTS}`);

	args.push(`https://www.youtube.com/watch?v=${videoId}`);
	return args;
}

/**
 * yt-dlp's own ERROR line, stripped of the noise around it.
 *
 * stderr also carries WARNINGs — the "you are using an out of date version"
 * banner, missing-metadata notes — and the last of those is NOT the failure.
 * Only ERROR: lines are, and the last one is the fatal one.
 */
function ytdlpError(stderr: string): string {
	const line = stderr
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.startsWith('ERROR:'))
		.pop();

	return line
		? line
				.replace(/^ERROR:\s*/, '')
				// "[youtube] dQw4w9WgXcQ: " — true but not worth the width.
				.replace(/^\[[^\]]+\]\s+[A-Za-z0-9_-]{6,}:\s*/, '')
				.trim()
		: '';
}

/**
 * What to actually DO about each failure yt-dlp reports.
 *
 * The raw message is accurate and useless: "Sign in to confirm you're not a
 * bot" reads like the app needs a login, when what it means is that this
 * server's IP is the problem. The admin sees these at 1am with no terminal, so
 * each one carries the next step rather than a symptom.
 */
const HINTS: { match: RegExp; hint: string }[] = [
	{
		match: /sign in to confirm|not a bot|confirm your age/i,
		hint: "YouTube is challenging this server rather than the video. Datacentre IPs get asked to prove they're human and only a signed-in cookie jar answers that — set YTDLP_COOKIES_B64 (infra/README.md)."
	},
	{
		match: /nsig extraction failed|unable to extract|player response|signature extraction/i,
		hint: 'That is the shape of yt-dlp falling behind YouTube — bump YTDLP_VERSION in the Dockerfile and redeploy.'
	},
	{
		match: /private video|video unavailable|removed by the uploader|has been terminated/i,
		hint: 'The video itself is gone or private — another upload of the same track should work.'
	},
	{
		match: /members-only|join this channel/i,
		hint: 'Members-only video — nothing to be done here.'
	},
	{
		match: /not available in your country|blocked it in your country|geo/i,
		hint: 'Geo-blocked where the server lives, not where you are — try a different upload.'
	},
	{
		match: /HTTP Error 429|too many requests/i,
		hint: 'Rate-limited. Leave it a few minutes before the next grab.'
	}
];

/**
 * Turn a failed grab into one sentence worth reading.
 *
 * ffmpeg is the loudest voice and the least informative one: when yt-dlp dies
 * it hands ffmpeg an empty pipe, and ffmpeg reports "Error opening input file
 * pipe:0 · Invalid data found when processing input" — which says nothing
 * about YouTube. yt-dlp's own ERROR line is the story, so it wins whenever
 * there is one.
 */
function grabFailure(ffmpegMessage: string, stderr: string, code: number | null): string {
	const reported = ytdlpError(stderr);
	if (reported) {
		const hint = HINTS.find((h) => h.match.test(reported))?.hint;
		return hint ? `${reported} — ${hint}` : reported;
	}

	// Died without saying why: still blame the right process.
	if (code) return `yt-dlp exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`;

	return ffmpegMessage;
}

/**
 * Download a video's audio and store it as an mp3 in the songs/ folder.
 *
 * yt-dlp streams the best audio to stdout; ffmpeg transcodes that stream to a
 * temp mp3 (a file rather than a second pipe, so ffmpeg can finalise the
 * container and the ID3 header properly); the bytes then go through
 * uploadObject like any admin upload. The temp file is removed no matter how
 * the attempt ends.
 */
export async function grabAudio(videoId: string): Promise<UploadResult & { image: string | null }> {
	if (!isVideoId(videoId)) throw new Error('Not a valid YouTube video id');

	const tmp = join(tmpdir(), `grab-${videoId}-${crypto.randomUUID().slice(0, 8)}.mp3`);
	const jar = await cookieJar();

	const dl = spawn('yt-dlp', ytdlpArgs(videoId, jar?.path ?? null), {
		stdio: ['ignore', 'pipe', 'pipe']
	});

	// Keep the tail of yt-dlp's stderr: when the pipe dies mid-stream, ffmpeg's
	// own error is just "output ended" and this is the part that says why.
	let dlErr = '';
	dl.stderr.on('data', (d) => {
		dlErr = (dlErr + d).slice(-2000);
	});

	// yt-dlp exiting and ffmpeg erroring are a race, and yt-dlp is the one with
	// the explanation — so its exit is tracked separately and the ffmpeg
	// handler waits for it before deciding what to report.
	let dlCode: number | null = null;
	const dlClosed = new Promise<void>((resolve) => {
		dl.on('close', (code) => {
			dlCode = code;
			resolve();
		});
	});

	try {
		await new Promise<void>((resolve, reject) => {
			// A missing binary surfaces here as ENOENT, not through ffmpeg.
			dl.on('error', (e) =>
				reject(new Error(`yt-dlp could not start: ${e.message} — is yt-dlp installed?`))
			);
			ffmpeg(dl.stdout)
				.audioCodec('libmp3lame')
				.audioBitrate(192)
				.toFormat('mp3')
				.on('end', () => resolve())
				.on('error', async (e) => {
					// Bounded: a hung yt-dlp must not hold the admin's request open.
					await Promise.race([dlClosed, new Promise((r) => setTimeout(r, 2000))]);
					reject(new Error(grabFailure(e.message, dlErr, dlCode)));
				})
				.save(tmp);
		});

		const bytes = await readFile(tmp);
		const file = new File([new Uint8Array(bytes)], `${videoId}.mp3`, { type: 'audio/mpeg' });
		const audio = await uploadObject(file, 'songs');
		// After the audio, never before: a thumbnail that fails must not cost a
		// download that already succeeded.
		return { ...audio, image: await grabThumbnail(videoId) };
	} finally {
		dl.kill();
		await jar?.dispose();
		await unlink(tmp).catch(() => void 0);
	}
}
