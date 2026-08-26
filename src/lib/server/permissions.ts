// Who may reach what.
//
// Two flags on the user document, both DEFAULT FALSE — an account with neither
// cannot sign in at all, which makes "no flags" the safe state for any document
// that predates this module or is created by hand:
//
//   isSuperAdmin  the whole admin: every collection, uploads, users.
//   isAdmin       the music side only — search YouTube, grab tracks, audition
//                 the playlist, and the songs collection behind those screens.
//
// A super-admin is a super-set: nothing checks isAdmin without also accepting
// isSuperAdmin. The flags live here rather than being re-derived at each call
// site so that the route guard, the API middleware and the navigation all
// answer from the same rules — a screen a user cannot open is also a screen
// whose endpoints refuse them.

import type { EntityName } from '$lib/types';

export type Access = {
	isAdmin: boolean;
	isSuperAdmin: boolean;
};

/**
 * Read the flags off a raw user document.
 *
 * Anything that is not exactly `true` is false: a missing field, a string, a
 * legacy `role: 'admin'`. Privilege is granted explicitly or not at all.
 */
export function accessOf(doc: Record<string, unknown> | null | undefined): Access {
	return {
		isAdmin: doc?.isAdmin === true,
		isSuperAdmin: doc?.isSuperAdmin === true
	};
}

/** May this account sign in? Neither flag means the account is dormant. */
export function canSignIn(a: Access): boolean {
	return a.isAdmin || a.isSuperAdmin;
}

export const isSuper = (a: Access | null | undefined) => a?.isSuperAdmin === true;
/** True for music-only admins AND super-admins — the super-set rule. */
export const isMusicAdmin = (a: Access | null | undefined) =>
	a?.isAdmin === true || a?.isSuperAdmin === true;

/**
 * Admin pages a music-only admin may open. Everything else under /admin is
 * super-admin territory; the guard sends them to their landing page instead of
 * a 403, since a dead end helps nobody who simply clicked the wrong link.
 */
export const MUSIC_ADMIN_PAGES = [
	'/admin/youtube',
	'/admin/playlist',
	// Their own account — language and password. About the person, not the
	// content, so every admin reaches it.
	'/admin/account'
];
// Deliberately NOT /admin/songs: the raw collection editor exposes every field
// of every track, the visibility switch included. A music admin works through
// the playlist and the grab screen, which is the same library with the rules
// applied. The API allowance below is what those two screens need, no more.

/** Where a music-only admin lands when they hit /admin or a page they cannot open. */
export const MUSIC_ADMIN_HOME = '/admin/playlist';

export function canOpenAdminPath(a: Access, pathname: string): boolean {
	if (isSuper(a)) return true;
	if (!isMusicAdmin(a)) return false;
	// /admin/logout must stay reachable: a user who cannot sign out is trapped.
	if (pathname === '/admin/logout') return true;
	return MUSIC_ADMIN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Collections a music-only admin may write through /api/v1/[entity].
 *
 * Exactly the one their screens edit. The uploader is allowed alongside it
 * because grabbing and uploading a track is the entire point of the role — the
 * size and MIME allowlist in s3.ts still applies to what they send.
 */
const MUSIC_ADMIN_ENTITIES: EntityName[] = ['songs'];

/**
 * Publishing — making a row visible on the public site — is super-admin only.
 *
 * A music admin fills the library; deciding what the world hears is a separate
 * act, and the person who can grab a track is not automatically the person who
 * chooses to put it on the front page.
 */
export const canPublish = (a: Access | null | undefined) => isSuper(a);

/**
 * Enforce that rule on one write.
 *
 * The two cases differ, and getting them the same way round matters:
 *
 *   creating — `isActive` is FORCED false. Repository.create defaults it to
 *              true, so merely dropping the key would publish every new row.
 *   updating — the key is DROPPED. Forcing false here would hide a track every
 *              time a music admin fixed its title; absent means "leave the
 *              visibility exactly as it is", which is the only safe reading of
 *              a write from someone who has no say over it.
 */
export function applyPublishPolicy<T extends Record<string, unknown>>(
	a: Access | null | undefined,
	patch: T,
	opts: { creating: boolean }
): T {
	if (canPublish(a)) return patch;
	const { isActive: _denied, ...rest } = patch;
	return (opts.creating ? { ...rest, isActive: false } : rest) as T;
}

/**
 * Whose tracks an account sees in the admin.
 *
 * `null` means every owner; a username means only that person's. A super-admin
 * gets null because publishing is theirs alone — scope them to their own shelf
 * and a music admin's grab could never reach the public site, since nobody who
 * can publish would be able to see it.
 *
 * A request with NO session also gets null, and that is not a hole: the public
 * site reaches songs through publicFilter(), which has already cut the list to
 * published rows. Ownership decides who edits a track, never who may hear one.
 */
export function songScope(
	session: (Access & { username?: string }) | null | undefined
): string | null {
	if (!session) return null;
	if (isSuper(session)) return null;
	// A session always carries a username; '' matches no document rather than
	// every document, which is the right way to fail if one ever does not.
	return session.username ?? '';
}

/** Narrow a mixed entity list to the songs this session owns. Others pass through. */
export function scopeSongs<T extends object>(
	entity: string,
	items: T[],
	session: (Access & { username?: string }) | null | undefined
): T[] {
	if (entity !== 'songs') return items;
	const scope = songScope(session);
	if (scope === null) return items;
	return items.filter((s) => (s as { owner?: string }).owner === scope);
}

/**
 * May this session write THIS song? Ownership, not role.
 *
 * Once libraries are private, "cannot see it" has to imply "cannot edit it" —
 * otherwise the id in a URL is enough to reach another admin's track through
 * the API, which is the whole scoping rule undone by one guessed string.
 */
export function ownsSong(
	session: (Access & { username?: string }) | null | undefined,
	song: { owner?: string } | null | undefined
): boolean {
	if (!song) return false;
	const scope = songScope(session);
	return scope === null || song.owner === scope;
}

/** Is this /api/... path writable by a music-only admin? */
export function canWriteApiPath(a: Access, pathname: string): boolean {
	if (isSuper(a)) return true;
	if (!isMusicAdmin(a)) return false;

	if (pathname.startsWith('/api/v1/uploads')) return true;

	const entity = pathname.replace(/^\/api\/v1\//, '').split('/')[0];
	return (MUSIC_ADMIN_ENTITIES as string[]).includes(entity);
}
