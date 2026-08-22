// Server-side refresh sessions.
//
// The access token is a short-lived JWT and is deliberately NOT revocable —
// verifying it costs a signature check and no round trip. Everything that has
// to be revocable lives here instead, in the `sessions` collection, so a stolen
// or ended session can actually be killed rather than merely waited out.
//
// Only a SHA-256 of each refresh token is stored. A dump of this collection
// therefore yields nothing usable: the token itself exists only in the client's
// cookie. SHA-256 rather than argon2 is correct here — the input is 32 bytes of
// CSPRNG output, not a human-chosen password, so there is no search space for
// an attacker to grind and nothing for a slow KDF to buy.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from './db';

export type SessionDoc = {
	_id?: unknown;
	userId: string;
	username: string;
	role: string;
	/** SHA-256 of the refresh token that is currently valid for this family. */
	tokenHash: string;
	/**
	 * Hashes this family has already rotated through. Presenting one of these
	 * means the token was replayed — see consumeRefreshToken.
	 */
	usedHashes: string[];
	/**
	 * Absolute end of the session, fixed at login. Rotation deliberately does
	 * NOT extend it: refreshing forever would make the short access lifetime
	 * pointless, and the requirement is that the user is eventually kicked out.
	 */
	expiresAt: Date;
	createdAt: Date;
	lastUsedAt: Date;
};

/** Rotations remembered per family — enough to catch a replay, bounded so the document cannot grow without limit. */
const MAX_REMEMBERED_ROTATIONS = 10;

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function newRefreshToken(): string {
	return randomBytes(32).toString('base64url');
}

async function sessions(): Promise<Collection<SessionDoc>> {
	const db = await getDb();
	const col = db.collection<SessionDoc>('sessions');
	// Idempotent. The TTL index lets Mongo reap expired sessions on its own, so
	// abandoned logins do not accumulate forever.
	await col
		.createIndexes([
			{ key: { tokenHash: 1 }, name: 'tokenHash_1' },
			{ key: { usedHashes: 1 }, name: 'usedHashes_1' },
			{ key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 }
		])
		.catch(() => void 0); // index creation must never take a login down
	return col;
}

/** Open a new session family and return its first refresh token. */
export async function createSession(
	user: { sub: string; username: string; role: string },
	ttlSeconds: number
): Promise<string> {
	const token = newRefreshToken();
	const now = new Date();
	const col = await sessions();
	await col.insertOne({
		userId: user.sub,
		username: user.username,
		role: user.role,
		tokenHash: hashToken(token),
		usedHashes: [],
		expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
		createdAt: now,
		lastUsedAt: now
	});
	return token;
}

export type ConsumeResult =
	| { ok: true; token: string; session: { sub: string; username: string; role: string }; expiresAt: Date }
	| { ok: false; reason: 'unknown' | 'expired' | 'replayed' };

/**
 * Exchange a refresh token for the next one.
 *
 * Rotation is single-use: the presented token is retired the moment it is
 * accepted. If a retired token is presented again, the only two explanations
 * are a stolen cookie being replayed or a client racing itself — and since the
 * two are indistinguishable from here, the whole family is destroyed. That
 * bounds the damage of a theft to one rotation window instead of the full
 * session, which is the entire point of rotating.
 */
export async function consumeRefreshToken(token: string): Promise<ConsumeResult> {
	const presented = hashToken(token);
	const col = await sessions();

	const doc = await col.findOne({ $or: [{ tokenHash: presented }, { usedHashes: presented }] });
	if (!doc) return { ok: false, reason: 'unknown' };

	// Replay of an already-rotated token: burn the family down.
	if (doc.tokenHash !== presented) {
		await col.deleteOne({ _id: doc._id });
		return { ok: false, reason: 'replayed' };
	}

	if (doc.expiresAt.getTime() <= Date.now()) {
		await col.deleteOne({ _id: doc._id });
		return { ok: false, reason: 'expired' };
	}

	const next = newRefreshToken();
	const nextHash = hashToken(next);
	await col.updateOne(
		{ _id: doc._id, tokenHash: presented }, // guard: lose the race, change nothing
		{
			$set: { tokenHash: nextHash, lastUsedAt: new Date() },
			$push: { usedHashes: { $each: [presented], $slice: -MAX_REMEMBERED_ROTATIONS } }
		}
	);

	return {
		ok: true,
		token: next,
		session: { sub: doc.userId, username: doc.username, role: doc.role },
		expiresAt: doc.expiresAt
	};
}

/** End a session for good — used by logout. Safe to call with a stale token. */
export async function revokeByToken(token: string | undefined): Promise<void> {
	if (!token) return;
	const h = hashToken(token);
	const col = await sessions();
	await col.deleteOne({ $or: [{ tokenHash: h }, { usedHashes: h }] });
}

/** Constant-time compare for the API bearer token. */
export function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}
