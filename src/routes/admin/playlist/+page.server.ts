// Admin playlist: the library, not the public queue — hidden tracks included.
//
// Scoped by OWNER. A music admin sees their own shelf and nothing else; a
// super-admin sees every owner, grouped into a folder each, because publishing
// is theirs alone and they cannot publish what they cannot see.
//
// It is also where publishing happens. A grab arrives hidden, and a super-admin
// decides which tracks the landing page actually plays; the rule itself lives in
// permissions.ts, because the entity editor and the API enforce the same one.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { songs } from '$lib/server/repositories';
import { canPublish, ownsSong, songScope } from '$lib/server/permissions';
import type { Song } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => ({
	songs: (await songs.listFor(songScope(locals.session), { activeOnly: false })) as Song[],
	// Drives the switch: shown as a control to a super-admin, as a read-only
	// state to everyone else. The action re-checks it — this is only the UI.
	mayPublish: canPublish(locals.session),
	// So the folder holding your own tracks can say so instead of repeating
	// your login address back at you.
	me: locals.session?.username ?? ''
});

export const actions: Actions = {
	visibility: async ({ request, locals }) => {
		if (!canPublish(locals.session)) {
			return fail(403, { message: 'Only a super-admin can change what the public site shows.' });
		}

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const next = String(form.get('next') ?? '') === 'true';
		if (!id) return fail(400, { message: 'Missing id.' });

		// Ownership as well as role. canPublish() alone would let a super-admin
		// flip anything, which is intended — but the check below is what stops a
		// music admin reaching another shelf's track by posting its id, now that
		// the list they are served no longer contains it.
		const existing = await songs.findById(id);
		if (!ownsSong(locals.session, existing)) return fail(404, { message: 'Track not found.' });

		const updated = await songs.update(id, { isActive: next });
		if (!updated) return fail(404, { message: 'Track not found.' });
		return { visible: next };
	}
};
