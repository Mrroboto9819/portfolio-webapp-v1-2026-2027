// Admin YouTube module: search videos, grab one's audio into the music library.
//
// Search rides the URL (?q=) like the entity list's search does, so a result
// set is linkable and survives a reload. The grab is a form action: it runs
// under the admin session the hooks already enforce, never as a public API.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	MAX_GRAB_SECONDS,
	grabAudio,
	isVideoId,
	searchVideos,
	splitTitle,
	videoMeta
} from '$lib/server/youtube';
import { songs } from '$lib/server/repositories';
import { storageConfigured } from '$lib/server/s3';
import type { Song } from '$lib/types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return { q, results: [], searchError: '', storageOn: storageConfigured() };

	try {
		return { q, results: await searchVideos(q), searchError: '', storageOn: storageConfigured() };
	} catch (e) {
		// A scrape can break whenever YouTube changes markup — the page must say
		// so rather than 500 on the whole admin route.
		const message = e instanceof Error ? e.message : 'Search failed';
		return { q, results: [], searchError: message, storageOn: storageConfigured() };
	}
};

export const actions: Actions = {
	grab: async ({ request, locals }) => {
		if (!storageConfigured()) return fail(503, { message: 'Object storage is not configured' });

		const form = await request.formData();
		const videoId = String(form.get('videoId') ?? '');
		const category = String(form.get('category') ?? '').trim();

		if (!isVideoId(videoId)) return fail(400, { message: 'Not a valid YouTube video id' });

		// One row per video PER OWNER: the credit line carries the source URL, so
		// it doubles as the dedupe key — no schema field spent on it.
		//
		// Scoped to the grabber's own shelf, and deliberately not to what a
		// super-admin can see: "already in the library" has to mean YOUR library,
		// or two admins could never keep the same track, and the refusal would
		// name a row the person being refused is not allowed to look at.
		const mine = (await songs.listFor(locals.session?.username ?? '', {
			activeOnly: false
		})) as Song[];
		const dupe = mine.find((s) => s.credit?.includes(videoId));
		if (dupe) return fail(409, { message: `Already in your library as “${dupe.title}”` });

		let meta;
		try {
			meta = await videoMeta(videoId);
		} catch {
			return fail(502, { message: 'Could not read the video’s metadata' });
		}
		// A live stream or a premiere has no end to transcode toward: the grab
		// would run until something else stopped it. Checked here and not only in
		// the UI, because the UI is a hint and this is the rule.
		if (meta.isLive || meta.seconds <= 0) {
			return fail(400, { message: 'That is a live stream — there is nothing finished to grab' });
		}
		if (meta.seconds > MAX_GRAB_SECONDS) {
			return fail(400, {
				message: `Too long (${meta.duration}) — the limit is ${MAX_GRAB_SECONDS / 60} minutes`
			});
		}

		try {
			const stored = await grabAudio(videoId);
			const { title, artist } = splitTitle(meta.title, meta.channel);

			const song = (await songs.create({
				title,
				artist,
				url: stored.url,
				...(stored.image ? { image: stored.image } : {}),
				credit: `Source: ${meta.channel} — ${meta.url}`,
				...(category ? { category } : {}),
				// The grab belongs to whoever pressed the button — this is what
				// gives each admin their own selection on the playlist page.
				owner: locals.session?.username ?? '',
				// Hidden on arrival, ALWAYS — including for a super-admin. A grab
				// is "this is worth considering", not "put this on the front page";
				// publishing is a second, deliberate act on the playlist screen.
				isActive: false
			})) as Song;

			return { grabbed: song.title, size: stored.size };
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Grab failed';
			return fail(500, { message });
		}
	}
};
