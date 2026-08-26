// Direct download of one YouTube video, as mp3 or mp4, to the admin's device.
//
// Under /admin/youtube deliberately: hooks.server.ts already guards that whole
// subtree, so this inherits the same session check and the same music-admin
// allowance as the search page that links to it. Nothing here is stored — the
// bytes go from yt-dlp to the browser and are forgotten.

import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { downloadVideo, isVideoId, type DownloadKind } from '$lib/server/youtube';

/**
 * Content-Disposition that survives a non-ASCII title.
 *
 * Two filenames, as RFC 6266 prescribes: an ASCII-only fallback for old
 * clients, and the real UTF-8 one. A track called "Café — Señor" is common
 * enough here that the accented form has to be the one that lands.
 */
function disposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const kind = url.searchParams.get('format');
	if (kind !== 'mp3' && kind !== 'mp4') error(400, "format must be 'mp3' or 'mp4'");
	if (!isVideoId(params.videoId)) error(400, 'Not a valid YouTube video id');

	try {
		const { stream, filename, contentType } = await downloadVideo(
			params.videoId,
			kind as DownloadKind
		);
		return new Response(Readable.toWeb(stream) as ReadableStream, {
			headers: {
				'content-type': contentType,
				'content-disposition': disposition(filename),
				// The transcode is not reproducible byte-for-byte and the URL is
				// per-video, so there is nothing worth a cache anywhere in between.
				'cache-control': 'no-store'
			}
		});
	} catch (e) {
		// The message is already the actionable one grabFailure() composed, so it
		// reaches the admin as-is rather than as a generic 500.
		error(502, e instanceof Error ? e.message : 'Download failed');
	}
};
