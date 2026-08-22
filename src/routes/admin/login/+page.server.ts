import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	REFRESH_COOKIE,
	SESSION_COOKIE,
	createSessionToken,
	refreshCookieOptions,
	refreshTtl,
	sessionCookieOptions,
	verifyCredentials
} from '$lib/server/auth';
import { createSession } from '$lib/server/sessions';

// Simple in-process attempt throttle. Not a substitute for a real rate limiter
// behind a proxy, but it stops a single host grinding passwords against a
// single-replica deployment. Resets on restart, which is acceptable here.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

function throttled(ip: string): number | null {
	const rec = attempts.get(ip);
	if (!rec) return null;
	if (Date.now() > rec.until) {
		attempts.delete(ip);
		return null;
	}
	return rec.count >= MAX_ATTEMPTS ? Math.ceil((rec.until - Date.now()) / 1000) : null;
}

function note(ip: string) {
	const rec = attempts.get(ip) ?? { count: 0, until: Date.now() + LOCKOUT_MS };
	rec.count += 1;
	rec.until = Date.now() + LOCKOUT_MS;
	attempts.set(ip, rec);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) redirect(303, url.searchParams.get('next') ?? '/admin');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');

		// Read the form first so every failure branch can echo the username back
		// and the shapes stay uniform for the client.
		const ip = getClientAddress();
		const wait = throttled(ip);
		if (wait) {
			return fail(429, { message: `Too many attempts. Try again in ${wait}s.`, username });
		}

		const session = await verifyCredentials(username, password);
		if (!session) {
			note(ip);
			// One message for both unknown-user and wrong-password: telling them
			// apart hands an attacker a way to enumerate valid usernames.
			return fail(401, { message: 'Invalid credentials.', username });
		}

		attempts.delete(ip);

		// Two cookies, two jobs: a short-lived access token the request hook can
		// verify without touching the database, and a rotating refresh token
		// backed by a `sessions` row so this login can actually be revoked and
		// so it ends at a fixed time no matter how active the user stays.
		const refresh = await createSession(session, refreshTtl());
		cookies.set(SESSION_COOKIE, await createSessionToken(session), sessionCookieOptions());
		cookies.set(REFRESH_COOKIE, refresh, refreshCookieOptions());

		redirect(303, url.searchParams.get('next') ?? '/admin');
	}
};
