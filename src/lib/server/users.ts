// Admin user management.
//
// The `users` collection is deliberately NOT part of the entity registry: the
// generic /api/v1/[entity] surface and the schema-driven editor must never be
// able to list or write password hashes. Everything below is reached only from
// the /admin/users form actions, which the hooks already gate behind a session.
//
// Passwords arrive as plain text from the form, are hashed with argon2id and
// forgotten — the same @node-rs/argon2 that verifyCredentials checks against,
// so a user created here signs in with no migration step. Hashes never leave
// this module: listUsers projects them away.

import { hash as argonHash } from '@node-rs/argon2';
import { ObjectId } from 'mongodb';
import { getDb } from './db';
import { accessOf, type Access } from './permissions';

export type AdminUserRow = {
	id: string;
	username: string;
	role: string;
	createdAt?: string;
} & Access;

const USERNAME = /^[a-z0-9._-]{3,32}$/i;
/** NIST-style: length is the requirement, composition rules are not. */
const MIN_PASSWORD = 10;

async function users() {
	const db = await getDb();
	return db.collection('users');
}

export async function listUsers(): Promise<AdminUserRow[]> {
	const col = await users();
	const docs = await col.find({}, { projection: { passwordHash: 0 } }).toArray();
	return docs.map((d) => ({
		id: d._id.toString(),
		username: String(d.username ?? ''),
		role: String(d.role ?? 'admin'),
		createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : undefined,
		...accessOf(d)
	}));
}

/**
 * Create a music-only admin.
 *
 * isSuperAdmin is written explicitly false rather than omitted: a reader of
 * the collection should see what this account is, not have to know that a
 * missing field means no. Promotion is a separate, deliberate act.
 *
 * Throws with a user-facing message; the action turns that into fail(400).
 */
export async function createUser(username: string, password: string): Promise<AdminUserRow> {
	if (!USERNAME.test(username)) {
		throw new Error('Username must be 3–32 characters: letters, digits, dot, dash, underscore');
	}
	if (password.length < MIN_PASSWORD) {
		throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
	}

	const col = await users();
	if (await col.findOne({ username })) throw new Error('That username is taken');

	const doc = {
		username,
		passwordHash: await argonHash(password),
		role: 'admin',
		isAdmin: true,
		isSuperAdmin: false,
		createdAt: new Date()
	};
	const { insertedId } = await col.insertOne(doc);
	return {
		id: insertedId.toString(),
		username,
		role: doc.role,
		isAdmin: true,
		isSuperAdmin: false,
		createdAt: doc.createdAt.toISOString()
	};
}

/**
 * Grant or revoke a flag.
 *
 * Revoking BOTH leaves a dormant account: it stays in the collection, keeps its
 * password, and cannot sign in — which is the reversible version of deleting
 * someone. The caller enforces that nobody does this to themselves.
 */
export async function setFlags(id: string, flags: Partial<Access>): Promise<void> {
	const patch: Record<string, boolean> = {};
	if (typeof flags.isAdmin === 'boolean') patch.isAdmin = flags.isAdmin;
	if (typeof flags.isSuperAdmin === 'boolean') patch.isSuperAdmin = flags.isSuperAdmin;
	if (!Object.keys(patch).length) return;

	const col = await users();
	const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: patch });
	if (!res.matchedCount) throw new Error('No such user');

	// Sessions carry the flags in a signed token, so an open session would keep
	// its old privilege for up to one access-token lifetime. Ending the session
	// makes a change take effect on the next request instead.
	await revokeSessionsFor(id);
}

export async function setPassword(id: string, password: string): Promise<void> {
	if (password.length < MIN_PASSWORD) {
		throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
	}
	const col = await users();
	const res = await col.updateOne(
		{ _id: new ObjectId(id) },
		{ $set: { passwordHash: await argonHash(password) } }
	);
	if (!res.matchedCount) throw new Error('No such user');

	// A password change is a statement that the old credential should stop
	// working — that includes any session still running on it.
	await revokeSessionsFor(id);
}

/**
 * Delete a user and end their sessions.
 *
 * The caller enforces the two policy rules — not yourself, not the last user —
 * because only the action knows who is asking.
 */
export async function removeUser(id: string): Promise<void> {
	const col = await users();
	const res = await col.deleteOne({ _id: new ObjectId(id) });
	if (!res.deletedCount) throw new Error('No such user');
	await revokeSessionsFor(id);
}

/**
 * Remember which language this user works in.
 *
 * Stored on the user rather than only in the `lang` cookie so the preference
 * follows them to a new browser: the cookie is what every request reads, and
 * signing in re-seeds it from here.
 */
export async function setLocale(id: string, locale: string): Promise<void> {
	const col = await users();
	await col.updateOne({ _id: new ObjectId(id) }, { $set: { locale } });
}

/** The stored preference, or null when they have never chosen one. */
export async function localeOf(id: string): Promise<string | null> {
	const col = await users();
	try {
		const doc = await col.findOne({ _id: new ObjectId(id) }, { projection: { locale: 1 } });
		return typeof doc?.locale === 'string' ? doc.locale : null;
	} catch {
		return null;
	}
}

/**
 * How many accounts can still administer everything.
 *
 * The one rule the UI cannot be trusted to keep: the last super-admin must not
 * be deletable or demotable, or the admin locks itself out of users, content
 * and settings with no way back in through the app.
 */
export async function countSuperAdmins(): Promise<number> {
	const col = await users();
	return col.countDocuments({ isSuperAdmin: true });
}

async function revokeSessionsFor(userId: string): Promise<void> {
	const db = await getDb();
	await db.collection('sessions').deleteMany({ userId });
}
