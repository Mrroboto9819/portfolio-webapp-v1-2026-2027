// Server hook chain:
//   1. session      — resolve the access cookie, or silently rotate the refresh
//                    cookie, into event.locals
//   2. csrfGuard    — block cross-origin writes on /api/*
//   3. adminGuard   — /admin/* requires a session (except the login page), and
//                    a music-only admin only reaches the music screens
//   4. writeGuard   — /api/* mutations require a session or the API token, and
//                    a music-only admin only writes the songs it edits
//
// Reads of /api/v1/* stay public: that content is the portfolio itself.
//
// Privilege is enforced HERE, not in the pages. A screen a user cannot open is
// also a screen whose endpoints refuse them: hiding a nav link is presentation,
// and presentation is not access control.

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
import { recordVisit } from '$lib/server/visits';
import {
	MUSIC_ADMIN_HOME,
	canOpenAdminPath,
	canWriteApiPath,
	isSuper
} from '$lib/server/permissions';
import { LOCALES, apiMessage, resolveLocale } from '$lib/i18n';

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
/**
 * Resolve the request locale.
 *
 * `?lang=` wins, so a link can pin a language for whoever receives it — the
 * same reason the filters live in the query string. An explicit choice is
 * remembered in a cookie; otherwise the browser's Accept-Language decides.
 *
 * The rendered <html lang> is rewritten to match, which matters for screen
 * readers and for the browser's own translation prompt.
 */
const locale: Handle = async ({ event, resolve }) => {
	const param = event.url.searchParams.get('lang');
	const chosen = resolveLocale({
		param,
		cookie: event.cookies.get('lang'),
		acceptLanguage: event.request.headers.get('accept-language')
	});
	event.locals.locale = chosen;

	// Only an explicit ?lang= writes the cookie: a browser-header guess is not
	// a choice, and persisting it would override the header later.
	if (param && LOCALES.includes(param as never) && event.cookies.get('lang') !== param) {
		event.cookies.set('lang', param, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false
		});
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', chosen)
	});
};

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
			return json({ message: apiMessage('api.forbidden', event.locals.locale) }, { status: 403 });
		}
	}

	return resolve(event);
};

const adminGuard: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;

	if (pathname.startsWith('/admin') && pathname !== LOGIN_PATH) {
		const session = event.locals.session;
		if (!session) {
			redirect(303, `${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`);
		}
		// A music-only admin who lands on a super-admin screen is sent to their
		// own home rather than shown a 403: they are legitimately signed in and
		// most likely followed a stale link or a bookmark.
		if (!canOpenAdminPath(session, pathname)) {
			redirect(303, MUSIC_ADMIN_HOME);
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
/**
 * Endpoints that require an admin even for GET.
 *
 * The write guard only inspects mutating methods, which is right for the
 * content API — those reads ARE the public site. But /api/v1/export returns
 * every collection including drafts and hidden rows in one response, so a
 * plain GET would hand the whole database to anyone who knew the path.
 */
const ADMIN_ONLY_PREFIXES = ['/api/v1/export'];

const readGuard: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
		// The export dumps every collection at once, so it is super-admin only:
		// a music admin has no business reading drafts, visits or credentials.
		if (!isSuper(event.locals.session)) {
			const expected = env.ADMIN_API_TOKEN;
			const presented = event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
			if (!expected || !presented || !safeEqual(presented, expected)) {
				return json(
					{ message: apiMessage('api.unauthorized', event.locals.locale) },
					{ status: 401 }
				);
			}
		}
	}
	return resolve(event);
};

const writeGuard: Handle = async ({ event, resolve }) => {
	const { request, url } = event;

	if (url.pathname.startsWith('/api/') && WRITE_METHODS.has(request.method)) {
		const session = event.locals.session;
		if (session) {
			// Signed in, but not necessarily for THIS collection. A music-only
			// admin writing anything but songs (or the uploader those songs need)
			// is refused here — the guard is the boundary, not the UI.
			if (canWriteApiPath(session, url.pathname)) return resolve(event);
			// A distinct message from the signed-out one: "sign in to make
			// changes" is actively misleading to someone who already has.
			return json({ message: apiMessage('api.notYours', event.locals.locale) }, { status: 403 });
		}

		const expected = env.ADMIN_API_TOKEN;
		const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

		if (expected && presented && safeEqual(presented, expected)) return resolve(event);

		// Localised from the request locale, which hooks already derived, so the
		// client does not have to translate a server string it did not author.
		const unauthorized = Boolean(expected && presented);
		return json(
			{
				message: apiMessage(
					unauthorized ? 'api.unauthorized' : 'api.forbidden',
					event.locals.locale
				)
			},
			{ status: unauthorized ? 401 : 403 }
		);
	}

	return resolve(event);
};

/**
 * Count public page views.
 *
 * Runs LAST in the chain and never blocks the response: the write is fired
 * without await, and a failure is swallowed. Analytics must not be able to
 * take the site down or slow it, so a broken Mongo makes the counter wrong,
 * not the page slow.
 *
 * Only real page GETs are counted — not assets, not the API, not the admin,
 * and not a visitor who opted out.
 */
const analytics: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	const { pathname } = event.url;
	const countable =
		event.request.method === 'GET' &&
		response.status < 400 &&
		!pathname.startsWith('/api/') &&
		!pathname.startsWith('/admin') &&
		!pathname.startsWith('/cdn/') &&
		!pathname.startsWith('/_app/') &&
		!/\.[a-z0-9]{2,5}$/i.test(pathname) && // assets: .png, .css, .js, .ico …
		event.cookies.get('analytics') !== 'off';

	if (countable) {
		void recordVisit({
			path: pathname,
			ip: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') ?? '',
			referrer: event.request.headers.get('referer'),
			// Cloudflare fronts this deployment and supplies the country; no
			// geo-IP lookup and no IP retention on our side.
			country: event.request.headers.get('cf-ipcountry')
		}).catch(() => {});
	}

	return response;
};

/**
 * Response headers: add the protective ones, remove the talkative ones.
 *
 * Runs OUTERMOST so it sees every response the app produces — pages, API
 * routes, errors and redirects alike. A header set on only some of those is a
 * header an attacker simply asks for on the others.
 *
 * The CSP itself is configured in svelte.config.js, because SvelteKit has to
 * hash its own inline bootstrap script to emit one without 'unsafe-inline'.
 * Everything here is what that mechanism does not cover.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const h = response.headers;

	// Content sniffing turns an uploaded file the server calls text/plain into
	// whatever the browser would rather it be, including a script.
	h.set('X-Content-Type-Options', 'nosniff');
	// frame-ancestors in the CSP is the modern control; this is the same rule
	// for anything that still only understands the legacy header.
	h.set('X-Frame-Options', 'DENY');
	// Full URLs (with their query strings — the filters live there) must not
	// travel to another origin in a Referer header.
	h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	h.set('Cross-Origin-Opener-Policy', 'same-origin');
	// EXPLICITLY OFF, not omitted. The legacy XSS auditor is deprecated and its
	// filtering has itself been used to introduce vulnerabilities, so the
	// correct modern value is 0 — and MinIO sends `1; mode=block` on /cdn,
	// which this overrides for everything the app serves.
	h.set('X-XSS-Protection', '0');

	// HSTS only over TLS: sent on a plain-HTTP dev origin it would pin
	// localhost to https and make the dev server unreachable.
	if (event.url.protocol === 'https:') {
		h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	// Framework fingerprinting. It tells an attacker which advisories to read
	// and buys us nothing in return.
	h.delete('x-sveltekit-page');
	h.delete('X-Powered-By');

	return response;
};

export const handle = sequence(
	securityHeaders,
	locale,
	session,
	csrfGuard,
	adminGuard,
	readGuard,
	writeGuard,
	analytics
);
