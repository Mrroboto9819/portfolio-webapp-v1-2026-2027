// Admin playlist: every uploaded track from every admin, including hidden ones
// — this screen is the library, not the public queue.
//
// It is also where publishing happens. A grab arrives hidden, and a super-admin
// decides which tracks the landing page actually plays; the rule itself lives in
// permissions.ts, because the entity editor and the API enforce the same one.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { songs } from '$lib/server/repositories';
import { canPublish } from '$lib/server/permissions';
import type { Song } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => ({
	songs: (await songs.list({ activeOnly: false })) as Song[],
	// Drives the switch: shown as a control to a super-admin, as a read-only
	// state to everyone else. The action re-checks it — this is only the UI.
	mayPublish: canPublish(locals.session)
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

		const updated = await songs.update(id, { isActive: next });
		if (!updated) return fail(404, { message: 'Track not found.' });
		return { visible: next };
	}
};
