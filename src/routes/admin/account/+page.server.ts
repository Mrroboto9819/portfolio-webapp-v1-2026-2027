// The signed-in user's own account: who they are, what access they hold, the
// language they work in, and their password.
//
// Open to EVERY admin, music admins included — it is the one screen that is
// about the person rather than the content, so permissions.ts lists it beside
// the music pages.
//
// Note what is NOT here: the access flags. Nobody edits their own privileges
// from their own settings page; that is the Users screen, and only a
// super-admin sees it.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { localeOf, setLocale, setPassword } from '$lib/server/users';
import { verifyCredentials } from '$lib/server/auth';
import { LOCALES, isLocale } from '$lib/i18n';

export const load: PageServerLoad = async ({ locals }) => ({
	// The saved preference, which may differ from the locale in effect for THIS
	// request (a ?lang= link wins for the page it was clicked from).
	savedLocale: locals.session ? await localeOf(locals.session.sub) : null,
	locales: LOCALES
});

export const actions: Actions = {
	language: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const locale = String(form.get('locale') ?? '');
		if (!isLocale(locale)) return fail(400, { message: 'Unknown language.' });
		if (!locals.session) return fail(401, { message: 'Not signed in.' });

		await setLocale(locals.session.sub, locale);
		// The cookie is what every request actually reads — the stored value is
		// what re-seeds it on the next sign-in, including from another browser.
		cookies.set('lang', locale, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false
		});
		return { languageSaved: locale };
	},

	password: async ({ request, locals }) => {
		if (!locals.session) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');

		// Changing your OWN password requires proving you know the old one: an
		// unattended session must not be enough to lock the real owner out.
		const ok = await verifyCredentials(locals.session.username, current);
		if (!ok) return fail(401, { message: 'That is not your current password.' });

		try {
			await setPassword(locals.session.sub, next);
			// setPassword revokes every session for the user, this one included —
			// so the next request lands on the login page, which is correct: the
			// credential they signed in with no longer exists.
			return { passwordChanged: true };
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Could not change password.' });
		}
	}
};
