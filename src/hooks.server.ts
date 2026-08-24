// Server hook chain:
//   1. session      — resolve the access cookie, or silently rotate the refresh
//                    cookie, into event.locals
//   2. csrfGuard    — block cross-origin writes on /api/*
//   3. adminGuard   — /admin/* requires a session (except the login page)
//   4. writeGuard   — /api/* mutations require a session or the API token
//
// Reads of /api/v1/* stay public: that content is the portfolio itself.

import { redirect, json, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import {
	REFRESH_COOKIE,
	REFRESH_PATH,
	SESSION_COOKIE,
	createSessionToken,
	readSessionToken,
	refreshCookieOptions,
	sessionCookieOptions
} from '$lib/server/auth';
import { consumeRefreshToken, safeEqual } from '$lib/server/sessions';

const ALLOWED_HOSTS = new Set([
	'pablocabrera.dev',
	'www.pablocabrera.dev',
	'beta.pablocabrera.dev',
	'localhost',
	'127.0.0.1',
	'0.0.0.0'
]);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOGIN_PATH = '/admin/login';

function hostOf(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

/**
 * Resolve the caller's identity, refreshing it transparently when possible.
 *
 * Order matters. The access token is checked first because it is the common
 * case and costs only a signature verification. The database is touched solely
 * when that token has aged out and a refresh cookie is actually present, so
 * public pages and anonymous traffic never reach Mongo through this hook.
 *
 * A failed refresh clears both cookies rather than leaving them to be retried
 * on every subsequent request: once the family is gone (expired, revoked, or
 * destroyed by a replay) nothing will ever make it valid again, and the user
 * needs to land on the login page instead of silently half-authenticated.
 */
const session: Handle = async ({ event, resolve }) => {
	event.locals.session = null;
	event.locals.sessionExpiresAt = null;

	const access = await readSessionToken(event.cookies.get(SESSION_COOKIE));
	if (access) {
		event.locals.session = access;
		return resolve(event);
	}

	const refresh = event.cookies.get(REFRESH_COOKIE);
	if (!refresh) return resolve(event);

	const result = await consumeRefreshToken(refresh);
	if (!result.ok) {
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
		event.cookies.delete(REFRESH_COOKIE, { path: REFRESH_PATH });
		return resolve(event);
	}

	// Rotated successfully: hand the client a fresh pair and carry on as if the
	// access token had never expired. The user sees no interruption.
	event.cookies.set(
		SESSION_COOKIE,
		await createSessionToken(result.session),
		sessionCookieOptions()
	);
	event.cookies.set(REFRESH_COOKIE, result.token, refreshCookieOptions());
	event.locals.session = result.session;
	event.locals.sessionExpiresAt = result.expiresAt;

	return resolve(event);
};

const csrfGuard: Handle = async ({ event, resolve }) => {
	const { request, url } = event;

	if (url.pathname.startsWith('/api/') && WRITE_METHODS.has(request.method)) {
		const origin = request.headers.get('origin');
		const sameOrigin = !origin || hostOf(origin) === url.hostname;
		const host = hostOf(origin) ?? hostOf(request.headers.get('referer'));

		if (!sameOrigin && (!host || !ALLOWED_HOSTS.has(host))) {
			return json({ message: 'Forbidden: cross-origin write blocked' }, { status: 403 });
		}
	}

	return resolve(event);
};

const adminGuard: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;

	if (pathname.startsWith('/admin') && pathname !== LOGIN_PATH) {
		if (!event.locals.session) {
			redirect(303, `${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`);
		}
	}

	return resolve(event);
};

/**
 * Write authorisation for /api/*.
 *
 * These routes write straight to the `portafolio` database — the same one the
 * production site reads — and carry no auth of their own. The CSRF guard is no
 * help against a non-browser client, which simply omits Origin (and an absent
 * Origin counts as same-origin). So mutations need either a logged-in admin
 * session (the admin UI) or a bearer token matching ADMIN_API_TOKEN (scripts).
 * With neither present, every write is refused: closed by default.
 */
const writeGuard: Handle = async ({ event, resolve }) => {
	const { request, url } = event;

	if (url.pathname.startsWith('/api/') && WRITE_METHODS.has(request.method)) {
		if (event.locals.session) return resolve(event);

		const expected = env.ADMIN_API_TOKEN;
		const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

		if (expected && presented && safeEqual(presented, expected)) return resolve(event);

		return json(
			{ message: expected ? 'Unauthorized' : 'Read-only: sign in to the admin to make changes' },
			{ status: expected && presented ? 401 : 403 }
		);
	}

	return resolve(event);
};

export const handle = sequence(session, csrfGuard, adminGuard, writeGuard);
