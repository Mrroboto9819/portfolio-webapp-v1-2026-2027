// What an anonymous caller may read from /api/v1/*.
//
// Reads of the content API are public on purpose — those reads ARE the site.
// But "public" has to mean *what the site shows anonymously*, and it did not:
// the generic list endpoint returned whatever the collection held.
//
// Two ways that leaked more than the pages do:
//
//   - `?all=true` sets activeOnly:false, so rows the admin deactivated — taken
//     down deliberately — came back to anyone who guessed the parameter.
//   - A post's `status` is separate from `isActive`, so an unpublished DRAFT is
//     an active row and was served in full, body included, while
//     /blog/[slug] correctly 404s that same draft for anonymous readers.
//
// The API must not contradict the pages. Both rules are enforced here, in one
// place, rather than in each route.

/** Entities with a publish state of their own, beyond `isActive`. */
const DRAFTABLE = new Set(['posts']);

/**
 * The repositories are generic over the WIRE entity, so a caller reaching this
 * helper holds a `BaseDoc` that TypeScript does not know carries `status`. The
 * check is therefore a narrowing read on an unknown-shaped object rather than a
 * declared field — the alternative is a cast at every call site.
 */
function isPublished(item: object): boolean {
	return (item as { status?: unknown }).status === 'published';
}

/** May this caller ask for deactivated rows? */
export function mayListInactive(session: unknown): boolean {
	return Boolean(session);
}

/**
 * Filter a list down to what `session` is allowed to see.
 *
 * A signed-in admin sees everything — the admin UI is the reason the flag
 * exists. Everyone else sees published rows only.
 */
export function publicFilter<T extends object>(entity: string, items: T[], session: unknown): T[] {
	if (session || !DRAFTABLE.has(entity)) return items;
	return items.filter(isPublished);
}

/** Single-document form: null when this caller must not see it. */
export function publicOne<T extends object>(
	entity: string,
	item: T | null,
	session: unknown
): T | null {
	if (!item || session || !DRAFTABLE.has(entity)) return item;
	return isPublished(item) ? item : null;
}
