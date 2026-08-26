// Admin users: list, create, reset password, change privilege, delete.
//
// The route itself is super-admin only — hooks.server.ts redirects a music
// admin away from every /admin path outside the music screens, POSTs to these
// actions included, so nothing here re-checks that.
//
// What DOES live here are the rules that depend on who is asking: you cannot
// delete or demote yourself, and the last super-admin cannot be removed either
// way. Both are lockout guards, which is why they sit next to the session
// rather than inside users.ts.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	countSuperAdmins,
	createUser,
	listUsers,
	removeUser,
	setEmail,
	setFlags,
	setPassword
} from '$lib/server/users';

export const load: PageServerLoad = async () => ({
	users: await listUsers()
});

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** Refuse anything that would remove the final super-admin. */
async function wouldStrandAdmin(targetIsSuper: boolean): Promise<boolean> {
	if (!targetIsSuper) return false;
	return (await countSuperAdmins()) <= 1;
}

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const email = String(form.get('email') ?? '').trim();
		try {
			const user = await createUser(username, password);
			// Separate call rather than a parameter: an address that fails
			// validation must not lose the account that was just created, and
			// the user can always add it afterwards.
			if (email) await setEmail(user.id, email);
			return { created: user.username };
		} catch (e) {
			return fail(400, { message: messageOf(e) });
		}
	},

	password: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const password = String(form.get('password') ?? '');
		try {
			await setPassword(id, password);
			return { updated: true };
		} catch (e) {
			return fail(400, { message: messageOf(e) });
		}
	},

	/** Set both flags at once — the form always submits the full intended state. */
	flags: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const isAdmin = form.get('isAdmin') === 'on';
		const isSuperAdmin = form.get('isSuperAdmin') === 'on';

		if (id === locals.session?.sub) {
			return fail(400, { message: 'Change your own privileges from the database, not from here' });
		}
		const users = await listUsers();
		const target = users.find((u) => u.id === id);
		if (!target) return fail(404, { message: 'No such user' });

		if (target.isSuperAdmin && !isSuperAdmin && (await wouldStrandAdmin(true))) {
			return fail(400, { message: 'Cannot demote the last super-admin' });
		}

		try {
			// One modal, one save: the address a recovery message goes to is
			// edited beside the privileges rather than behind a second button.
			await setEmail(id, String(form.get('email') ?? ''));
			await setFlags(id, { isAdmin, isSuperAdmin });
			return { updated: true };
		} catch (e) {
			return fail(400, { message: messageOf(e) });
		}
	},

	remove: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');

		if (id === locals.session?.sub) {
			return fail(400, { message: 'You cannot delete the account you are signed in with' });
		}

		const users = await listUsers();
		const target = users.find((u) => u.id === id);
		if (!target) return fail(404, { message: 'No such user' });

		if (await wouldStrandAdmin(target.isSuperAdmin)) {
			return fail(400, { message: 'Cannot delete the last super-admin' });
		}

		try {
			await removeUser(id);
			return { removed: true };
		} catch (e) {
			return fail(400, { message: messageOf(e) });
		}
	}
};
