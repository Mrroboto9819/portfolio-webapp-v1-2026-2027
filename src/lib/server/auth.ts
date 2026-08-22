// Admin authentication.
//
// Reuses the EXISTING `users` collection from the previous portfolio — same
// username, same argon2 password hash — so the credentials that already work
// keep working. Nothing about the stored user is rewritten on login.
//
// The session is a signed JWT in an httpOnly, SameSite=Lax cookie. The signing
// key is JWT_ACCESS_SECRET, injected from the environment at run time.

import { SignJWT, jwtVerify } from 'jose';
import { verify as argonVerify } from '@node-rs/argon2';
import { env } from '$env/dynamic/private';
import { getDb } from './db';

export const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h

export type AdminSession = { sub: string; username: string; role: string };

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
};

/**
 * Verify a username/password pair against the users collection.
 * Returns null for both "no such user" and "wrong password" — the caller must
 * not distinguish them in what it tells the client.
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

	return { sub: user._id.toString(), username: user.username, role: user.role ?? 'admin' };
}

export async function createSessionToken(session: AdminSession): Promise<string> {
	return new SignJWT({ username: session.username, role: session.role })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(session.sub)
		.setIssuedAt()
		.setExpirationTime(`${SESSION_TTL_SECONDS}s`)
		.sign(key());
}

export async function readSessionToken(token: string | undefined): Promise<AdminSession | null> {
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, key());
		if (!payload.sub) return null;
		return {
			sub: payload.sub,
			username: String(payload.username ?? ''),
			role: String(payload.role ?? '')
		};
	} catch {
		return null; // expired, tampered, or signed with a different key
	}
}

export const sessionCookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: true,
	maxAge: SESSION_TTL_SECONDS
};
