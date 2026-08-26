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
// The mp3 lands in object storage through the SAME uploadObject() the admin
// uploader uses — same songs/ folder, same size ceiling, same key shape — and
// only the returned URL reaches the database, like every other upload.

import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

	const dl = spawn(
		'yt-dlp',
		[
			'-f',
			'bestaudio/best',
			'--no-playlist',
			'-o',
			'-',
			`https://www.youtube.com/watch?v=${videoId}`
		],
		{ stdio: ['ignore', 'pipe', 'pipe'] }
	);

	// Keep the tail of yt-dlp's stderr: when the pipe dies mid-stream, ffmpeg's
	// own error is just "output ended" and this is the part that says why.
	let dlErr = '';
	dl.stderr.on('data', (d) => {
		dlErr = (dlErr + d).slice(-1000);
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
				.on('error', (e) =>
					reject(new Error(`${e.message} · yt-dlp said: ${dlErr || '(nothing)'}`))
				)
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
		await unlink(tmp).catch(() => void 0);
	}
}
