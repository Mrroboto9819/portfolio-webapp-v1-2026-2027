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

import { randomBytes } from 'node:crypto';
import { hash as argonHash } from '@node-rs/argon2';
import { ObjectId } from 'mongodb';
import { getDb } from './db';
import { accessOf, canSignIn, type Access } from './permissions';

export type AdminUserRow = {
	id: string;
	username: string;
	role: string;
	createdAt?: string;
	/** Where a recovery message goes. Optional — an account without one simply
	 *  cannot be recovered by email, which is a deliberate, visible state. */
	email?: string;
	/** Set by a recovery: the temporary password must be replaced at next sign-in. */
	mustChangePassword?: boolean;
} & Access;

// `@` and `+` are allowed because the existing account IS an email address —
// this project's convention — and a rule that rejects the operator's own
// username would be a rule that has never been read.
const USERNAME = /^[a-z0-9._+@-]{3,64}$/i;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
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
		...(typeof d.email === 'string' && d.email ? { email: d.email } : {}),
		mustChangePassword: d.mustChangePassword === true,
		...accessOf(d)
	}));
}

/**
 * Where a recovery message for this account would go.
 *
 * The stored `email` wins; failing that, the username itself when it IS an
 * address — which is how the original account was created, and asking the
 * operator to retype their own address into a second field to recover it would
 * be pure ceremony.
 */
export function recoveryAddress(doc: Record<string, unknown>): string | null {
	const email = typeof doc.email === 'string' ? doc.email.trim() : '';
	if (EMAIL.test(email)) return email;
	const username = typeof doc.username === 'string' ? doc.username.trim() : '';
	return EMAIL.test(username) ? username : null;
}

export async function setEmail(id: string, email: string): Promise<void> {
	const clean = email.trim();
	if (clean && !EMAIL.test(clean)) throw new Error('That does not look like an email address');
	const col = await users();
	const res = await col.updateOne(
		{ _id: new ObjectId(id) },
		clean ? { $set: { email: clean } } : { $unset: { email: '' } }
	);
	if (!res.matchedCount) throw new Error('No such user');
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
		{
			$set: { passwordHash: await argonHash(password) },
			// Choosing your own password clears the temporary-password state:
			// this is exactly the act the flag was waiting for.
			$unset: { mustChangePassword: '' }
		}
	);
	if (!res.matchedCount) throw new Error('No such user');

	// A password change is a statement that the old credential should stop
	// working — that includes any session still running on it.
	await revokeSessionsFor(id);
}

/**
 * The alphabet a temporary password is drawn from.
 *
 * No 0/O, 1/l/I: this string is read out of an email and typed by hand, often
 * from a phone, and a character someone cannot tell apart from another is a
 * support request waiting to happen. 28 symbols over 16 characters is ~77 bits,
 * far past anything that could be guessed before it is replaced.
 */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEMP_LENGTH = 16;

function temporaryPassword(): string {
	// rejection-free: 32 symbols divides 256 evenly, so a plain modulo is
	// uniform here and no byte has to be thrown away.
	const bytes = randomBytes(TEMP_LENGTH);
	let out = '';
	for (let i = 0; i < TEMP_LENGTH; i++) {
		out += TEMP_ALPHABET[bytes[i] % TEMP_ALPHABET.length];
		// Grouped for legibility — the separator is part of the password.
		if (i % 4 === 3 && i !== TEMP_LENGTH - 1) out += '-';
	}
	return out;
}

export type Recovery = {
	username: string;
	email: string;
	password: string;
};

/**
 * Issue a temporary password for whoever owns `identifier`.
 *
 * Returns null when there is nothing to do — no such account, or an account
 * with no address to send to. The CALLER must treat null and success the same
 * in what it tells the browser, or this becomes an oracle for which usernames
 * and emails exist.
 *
 * The new password is returned, never stored in the clear: the hash is what
 * lands in Mongo, and the plaintext exists only long enough to be handed to
 * the mailer. Every session for that user is ended — a recovery is the case
 * where an attacker may be the one holding the old session.
 */
export async function issueTemporaryPassword(identifier: string): Promise<Recovery | null> {
	const id = identifier.trim();
	if (!id) return null;

	const col = await users();
	// Case-insensitive on both fields: email addresses are not case-sensitive
	// in practice, and someone recovering an account types what they remember.
	const pattern = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
	const doc = await col.findOne({ $or: [{ username: pattern }, { email: pattern }] });
	if (!doc) return null;

	const email = recoveryAddress(doc);
	if (!email) return null;

	// Both flags false means the account is dormant and cannot sign in at all;
	// mailing it a working password would quietly undo that.
	if (!canSignIn(accessOf(doc))) return null;

	const password = temporaryPassword();
	await col.updateOne(
		{ _id: doc._id },
		{
			$set: {
				passwordHash: await argonHash(password),
				mustChangePassword: true,
				passwordResetAt: new Date()
			}
		}
	);
	await revokeSessionsFor(doc._id.toString());

	return { username: String(doc.username ?? ''), email, password };
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
