// Server hook chain:
//   1. session      — resolve the admin session cookie into event.locals
//   2. csrfGuard    — block cross-origin writes on /api/*
//   3. adminGuard   — /admin/* requires a session (except the login page)
//   4. writeGuard   — /api/* mutations require a session or the API token
//
// Reads of /api/v1/* stay public: that content is the portfolio itself.

import { redirect, json, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE, readSessionToken } from '$lib/server/auth';

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

const session: Handle = async ({ event, resolve }) => {
	event.locals.session = await readSessionToken(event.cookies.get(SESSION_COOKIE));
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

		if (expected && presented && presented === expected) return resolve(event);

		return json(
			{ message: expected ? 'Unauthorized' : 'Read-only: sign in to the admin to make changes' },
			{ status: expected && presented ? 401 : 403 }
		);
	}

	return resolve(event);
};

export const handle = sequence(session, csrfGuard, adminGuard, writeGuard);
