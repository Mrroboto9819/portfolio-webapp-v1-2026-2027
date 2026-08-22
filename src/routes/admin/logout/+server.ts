import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { REFRESH_COOKIE, REFRESH_PATH, SESSION_COOKIE } from '$lib/server/auth';
import { revokeByToken } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ cookies }) => {
	// Delete the server-side session first. Clearing the cookies alone would
	// leave a working refresh token in the hands of anyone who copied it before
	// logout — "sign out" has to mean the session is gone, not just forgotten
	// by this browser.
	await revokeByToken(cookies.get(REFRESH_COOKIE));

	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(REFRESH_COOKIE, { path: REFRESH_PATH });
	redirect(303, '/admin/login');
};
