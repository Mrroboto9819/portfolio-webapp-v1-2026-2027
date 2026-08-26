// Admin authentication.
//
// Reuses the EXISTING `users` collection from the previous portfolio — same
// username, same argon2 password hash — so the credentials that already work
// keep working. Nothing about the stored user is rewritten on login.
//
// Sessions are a two-token pair, both httpOnly + SameSite=Lax cookies:
//
//   admin_access   short-lived signed JWT (default 5 min). Stateless: checked
//                  by signature alone, so the common request costs no DB round
//                  trip. Not revocable, which is exactly why it is short.
//   admin_refresh  opaque random token, rotated on every use, backed by a row
//                  in `sessions`. This is the revocable half, and it carries
//                  the absolute session lifetime.
//
// A stolen access token is therefore useful for minutes rather than hours, and
// a stolen refresh token is detected the moment the real client rotates next —
// see consumeRefreshToken. Signing key is JWT_ACCESS_SECRET, injected at run
// time; lifetimes come from JWT_ACCESS_TTL_SECONDS / JWT_REFRESH_TTL_SECONDS.

import { SignJWT, jwtVerify } from 'jose';
import { verify as argonVerify } from '@node-rs/argon2';
import { env } from '$env/dynamic/private';
import { getDb } from './db';
import { accessOf, canSignIn, type Access } from './permissions';

export const SESSION_COOKIE = 'admin_access';
export const REFRESH_COOKIE = 'admin_refresh';

/**
 * The refresh cookie is confined to the admin area.
 *
 * The browser only attaches a cookie to requests whose path matches, so this
 * one is never sent with a request for the public site, an image, or a public
 * /api/v1 read — the places it could leak from (a proxy log, a referrer, a
 * third-party asset) but could never be used. The admin UI performs every
 * write through a SvelteKit form action under /admin, so nothing legitimate
 * needs it anywhere else.
 *
 * Deletions must repeat this exact path: a cookie is identified by name AND
 * path, so clearing it with path '/' silently leaves this one in place.
 */
export const REFRESH_PATH = '/admin';

/** Read a positive integer from the environment, falling back when unset or junk. */
function ttl(name: string, fallback: number): number {
	const n = Number(env[name]);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** How long an access token is accepted. Short on purpose. */
export const accessTtl = () => ttl('JWT_ACCESS_TTL_SECONDS', 300); // 5 min
/**
 * Absolute session lifetime. Rotation does not extend it, so this is the point
 * at which the user is signed out no matter how recently they were active.
 */
export const refreshTtl = () => ttl('JWT_REFRESH_TTL_SECONDS', 60 * 60 * 8); // 8h

/**
 * The identity every request carries.
 *
 * The two privilege flags travel INSIDE the signed access token rather than
 * being looked up per request: the point of a stateless access token is that
 * verifying it costs a signature check and no round trip. They are re-read from
 * the user document at login and at every refresh rotation (5 minutes at most),
 * so a revoked privilege takes effect within one access-token lifetime.
 */
export type AdminSession = {
	sub: string;
	username: string;
	role: string;
	/**
	 * True while the account is on a password issued by the recovery flow.
	 * The route guard pins such a session to the account screen until it is
	 * replaced, so a password that travelled through email cannot quietly
	 * become the permanent one.
	 */
	mustChangePassword?: boolean;
} & Access;

function key(): Uint8Array {
	const secret = env.JWT_ACCESS_SECRET;
	if (!secret || secret.length < 32) {
		// Fail closed and loudly rather than signing sessions with a weak or
		// absent key — an attacker who can guess the key can mint admin sessions.
		throw new Error('JWT_ACCESS_SECRET is missing or shorter than 32 characters');
	}
	return new TextEncoder().encode(secret);
}

type UserDoc = {
	_id: { toString(): string };
	username: string;
	passwordHash: string;
	role?: string;
	isAdmin?: boolean;
	isSuperAdmin?: boolean;
	mustChangePassword?: boolean;
};

/**
 * Verify a username/password pair against the users collection.
 * Returns null for "no such user", "wrong password" AND "no privilege flags" —
 * the caller must not distinguish them in what it tells the client.
 */
export async function verifyCredentials(
	username: string,
	password: string
): Promise<AdminSession | null> {
	if (!username || !password) return null;

	const db = await getDb();
	const user = (await db.collection('users').findOne({ username })) as UserDoc | null;
	if (!user?.passwordHash) return null;

	let ok = false;
	try {
		ok = await argonVerify(user.passwordHash, password);
	} catch {
		return null; // malformed stored hash — treat as a failed login
	}
	if (!ok) return null;

	// Both flags default false, so an account nobody has granted anything to
	// cannot sign in even with the correct password. That is what makes the
	// dormant state safe: a leaked hash on an unflagged user opens nothing.
	const access = accessOf(user as unknown as Record<string, unknown>);
	if (!canSignIn(access)) {
		// The BROWSER is told "invalid credentials" like every other failure —
		// telling the two apart is how usernames get enumerated. The operator,
		// though, needs to be able to tell them apart, because "correct password,
		// no flags" looks identical to a typo from the outside and is the single
		// most likely reason a working account suddenly cannot sign in.
		//
		// Note the strict === true in accessOf: a flag added through Atlas's
		// editor as the STRING "true" is not a grant, and this is where that
		// shows up.
		console.warn(
			`[auth] ${username}: password correct but no privilege flag ` +
				`(isAdmin=${JSON.stringify(user.isAdmin)}, isSuperAdmin=${JSON.stringify(user.isSuperAdmin)}) ` +
				'— set isSuperAdmin to boolean true on this document'
		);
		return null;
	}

	return {
		sub: user._id.toString(),
		username: user.username,
		role: user.role ?? 'admin',
		mustChangePassword: user.mustChangePassword === true,
		...access
	};
}

/**
 * Re-read the live account state for a user id.
 *
 * Used on refresh rotation so a flag revoked in the database reaches a live
 * session without waiting for it to expire. A user deleted mid-session comes
 * back with no flags, which fails canSignIn and ends the session.
 *
 * mustChangePassword rides along for the same reason: rebuilding the session
 * from the flags alone would drop it, and the temporary-password pin would
 * quietly lift itself at the first rotation — five minutes after sign-in.
 */
export async function currentAccess(
	userId: string
): Promise<Access & { mustChangePassword: boolean }> {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	let doc: Record<string, unknown> | null = null;
	try {
		doc = (await db.collection('users').findOne({ _id: new ObjectId(userId) })) as Record<
			string,
			unknown
		> | null;
	} catch {
		return { isAdmin: false, isSuperAdmin: false, mustChangePassword: false }; // unparseable id
	}
	return { ...accessOf(doc), mustChangePassword: doc?.mustChangePassword === true };
}

export async function createSessionToken(session: AdminSession): Promise<string> {
	return new SignJWT({
		username: session.username,
		role: session.role,
		isAdmin: session.isAdmin,
		isSuperAdmin: session.isSuperAdmin,
		mustChangePassword: session.mustChangePassword === true
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(session.sub)
		.setIssuedAt()
		.setExpirationTime(`${accessTtl()}s`)
		.sign(key());
}

export async function readSessionToken(token: string | undefined): Promise<AdminSession | null> {
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, key());
		if (!payload.sub) return null;
		// The claims are read through accessOf like a user document would be, so
		// a token minted before the flags existed decodes as no privilege rather
		// than as undefined leaking into a check.
		const access = accessOf(payload as unknown as Record<string, unknown>);
		if (!canSignIn(access)) return null;
		return {
			sub: payload.sub,
			username: String(payload.username ?? ''),
			role: String(payload.role ?? ''),
			mustChangePassword: payload.mustChangePassword === true,
			...access
		};
	} catch {
		return null; // expired, tampered, or signed with a different key
	}
}

const baseCookie = {
	// httpOnly on both: document.cookie cannot read either token, so an XSS
	// payload cannot exfiltrate the session even while it runs on the page.
	httpOnly: true,
	sameSite: 'lax' as const,
	// Dev runs over plain http on localhost, where a Secure cookie is silently
	// dropped and the login appears to succeed while never sticking.
	secure: process.env.NODE_ENV !== 'development'
};

/** Cookie for the access token. Expires with the token it carries. */
export const sessionCookieOptions = () => ({ ...baseCookie, path: '/', maxAge: accessTtl() });

/** Cookie for the refresh token — see REFRESH_PATH for why it is scoped. */
export const refreshCookieOptions = () => ({
	...baseCookie,
	path: REFRESH_PATH,
	maxAge: refreshTtl()
});
