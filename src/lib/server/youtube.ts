// YouTube search + audio grab for the admin music library.
//
// EVERY leg is yt-dlp — search, metadata and the download. Deliberately not a
// JS library: @distube/ytdl-core cannot even be imported under Bun (its cookie
// agent needs undici Agent.compose, which Bun's built-in undici lacks), and
// youtubei.js gets 403s from googlevideo without the PoToken machinery. yt-dlp
// is the one tool that keeps up with YouTube's countermeasures, and a
// subprocess behaves identically under Bun and Node.
//
// Search used to be yt-search, a plain HTML scrape. It was replaced because it
// is unmaintained (2.13.1 is both what we had and the latest release) and
// parses every result eagerly: one item in an unexpected shape — a live radio
// stream, whose title is not a plain string — threw `title.trim is not a
// function` and took the WHOLE result set with it. Searching through yt-dlp
// means one tool to keep current instead of two, and the search inherits the
// cookies below, which a scrape could not use.
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
//        YTDLP_JS_RUNTIME     override the JS runtime that solves YouTube's
//                             challenge. The image installs deno, which yt-dlp
//                             enables by default, so this is only an escape
//                             hatch: set it to `bun` (already in the image, no
//                             rebuild needed) if deno ever stops working.
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
	/** "3:05", straight from yt-dlp. Empty for a live stream, which has none. */
	duration: string;
	seconds: number;
	views: number;
	/** Live streams and premieres cannot be grabbed — the UI says so instead. */
	isLive: boolean;
};

/**
 * Run yt-dlp to completion and hand back stdout.
 *
 * The streaming download in grabAudio() cannot use this — it needs the pipe —
 * but search and metadata are both "run it, read the JSON", and doing that in
 * one place means they share the cookie/proxy handling and report failures the
 * same way the grab does.
 */
async function ytdlpJSON(args: string[], timeoutMs = 45_000): Promise<string> {
	const jar = await cookieJar();
	const proc = spawn('yt-dlp', [...configArgs(jar?.path ?? null), ...args], {
		stdio: ['ignore', 'pipe', 'pipe']
	});

	let out = '';
	let err = '';
	proc.stdout.on('data', (d) => (out += d));
	proc.stderr.on('data', (d) => (err = (err + d).slice(-2000)));

	// A hung extractor must not hold an admin request open forever.
	const killer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);

	try {
		const code = await new Promise<number | null>((resolve, reject) => {
			proc.on('error', (e) =>
				reject(new Error(`yt-dlp could not start: ${e.message} — is yt-dlp installed?`))
			);
			proc.on('close', resolve);
		});
		if (code !== 0) throw new Error(grabFailure(`yt-dlp exited with code ${code}`, err, code));
		return out;
	} finally {
		clearTimeout(killer);
		await jar?.dispose();
	}
}

/**
 * Search YouTube.
 *
 * --flat-playlist is what keeps this fast: it reads the search result page and
 * stops, rather than resolving every hit's formats (which would mean one full
 * extraction, JS challenge and all, per row). Every field the list needs is on
 * that page already.
 *
 * One JSON object per line, and a malformed line is SKIPPED rather than thrown
 * — the precise failure that retired yt-search. A search that can show eleven
 * of twelve results must show eleven.
 */
export async function searchVideos(query: string, limit = 12): Promise<VideoHit[]> {
	const q = query.trim();
	if (!q) return [];

	// The query is one argv entry, never a shell string, so a colon or a quote
	// in it is data. `ytsearchN:` is yt-dlp's own search pseudo-URL.
	const out = await ytdlpJSON([
		'--dump-json',
		'--flat-playlist',
		'--no-warnings',
		`ytsearch${Math.max(1, Math.min(limit, 25))}:${q}`
	]);

	const hits: VideoHit[] = [];
	for (const line of out.split('\n')) {
		if (!line.trim()) continue;
		try {
			const v = JSON.parse(line);
			if (!isVideoId(String(v.id ?? ''))) continue;
			hits.push(toHit(v));
		} catch {
			// One unreadable row, not a failed search.
		}
	}
	return hits;
}

/** Shape one yt-dlp record into what the page renders. */
function toHit(v: Record<string, unknown>): VideoHit {
	const id = String(v.id);
	const seconds = Number(v.duration ?? 0) || 0;
	const live = v.live_status === 'is_live' || v.live_status === 'is_upcoming';
	return {
		videoId: id,
		title: String(v.title ?? '(untitled)'),
		description: String(v.description ?? ''),
		url: String(v.url ?? `https://www.youtube.com/watch?v=${id}`),
		// The id-derived URL rather than thumbnails[]: it is the same image, it
		// is always there, and it does not carry yt-dlp's signed query string.
		thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
		channel: String(v.channel ?? v.uploader ?? ''),
		duration: String(v.duration_string ?? '') || (live ? 'LIVE' : ''),
		seconds,
		views: Number(v.view_count ?? 0) || 0,
		isLive: live
	};
}

/** Authoritative metadata for one video — the grab re-reads it server-side
 *  rather than trusting hidden form inputs. */
export async function videoMeta(videoId: string) {
	if (!isVideoId(videoId)) throw new Error('Not a valid YouTube video id');

	// A full extraction, unlike search: this is the check that decides whether a
	// grab may start, so it has to be the real record for THIS video.
	const out = await ytdlpJSON([
		'--dump-json',
		'--no-playlist',
		'--no-warnings',
		`https://www.youtube.com/watch?v=${videoId}`
	]);

	const v = JSON.parse(out.trim().split('\n')[0] || '{}');
	const live = v.live_status === 'is_live' || v.live_status === 'is_upcoming';
	return {
		videoId,
		title: String(v.title ?? ''),
		url: String(v.webpage_url ?? `https://www.youtube.com/watch?v=${videoId}`),
		channel: String(v.channel ?? v.uploader ?? ''),
		seconds: Number(v.duration ?? 0) || 0,
		duration: String(v.duration_string ?? ''),
		isLive: live
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
/**
 * The environment-driven flags, shared by every yt-dlp call.
 *
 * Search, metadata and the download all face the same YouTube, so they all
 * need the same cookies and the same runtime — a search that is refused as a
 * bot is no more use than a download that is.
 */
function configArgs(cookies: string | null): string[] {
	const args: string[] = [];
	if (cookies) args.push('--cookies', cookies);
	if (env.YTDLP_PROXY) args.push('--proxy', env.YTDLP_PROXY);
	// --no-js-runtimes FIRST, or the override is merely added alongside deno
	// and deno still wins — it outranks every other runtime.
	if (env.YTDLP_JS_RUNTIME) args.push('--no-js-runtimes', '--js-runtimes', env.YTDLP_JS_RUNTIME);
	if (env.YTDLP_PLAYER_CLIENTS)
		args.push('--extractor-args', `youtube:player_client=${env.YTDLP_PLAYER_CLIENTS}`);
	return args;
}

/** The download leg's own arguments, on top of configArgs(). */
function ytdlpArgs(videoId: string, cookies: string | null): string[] {
	return [
		'-f',
		'bestaudio/best',
		'--no-playlist',
		// The media goes to stdout, so yt-dlp's progress bar goes to stderr —
		// where it would flood the tail we keep and evict the one ERROR line
		// that explains a failure.
		'--no-progress',
		'-o',
		'-',
		...configArgs(cookies),
		`https://www.youtube.com/watch?v=${videoId}`
	];
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
		// Reads like a browser problem; it is actually yt-dlp failing to execute
		// YouTube's JS challenge, which needs a JavaScript runtime on the box.
		match: /page needs to be reloaded|\[jsc|jsc:|js challenge|js runtime/i,
		hint: "YouTube's JS challenge could not be solved — the container needs a JavaScript runtime (deno) for that. If deno is installed and this persists, try YTDLP_JS_RUNTIME=bun."
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
