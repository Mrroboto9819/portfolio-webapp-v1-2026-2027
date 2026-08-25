// Browser-local persistence for client state.
//
// Every store that has to survive a reload goes through here rather than
// touching localStorage directly, for two reasons: storage throws outright in
// private mode and when a browser is set to block site data, and a single
// namespace keeps this site's keys from colliding with anything else served
// from the same origin.
//
// Nothing here is a source of truth. Everything the SERVER knows still comes
// from `load`; this is only for what the browser alone can know — where the
// listener was in a track, how loud they set it, when they last heard it.

import { browser } from '$app/environment';

const NS = 'pcc:';

/** Read and parse a stored value, falling back on anything unexpected. */
export function readJSON<T>(key: string, fallback: T): T {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(NS + key);
		if (raw === null) return fallback;
		const parsed = JSON.parse(raw) as unknown;
		// A stored value can be from an older shape of the app. Anything that is
		// not the same broad kind as the fallback is treated as absent — worse
		// than an old value is a crash on someone's second visit.
		if (parsed === null || typeof parsed !== typeof fallback) return fallback;
		return parsed as T;
	} catch {
		return fallback;
	}
}

export function writeJSON(key: string, value: unknown): void {
	if (!browser) return;
	try {
		localStorage.setItem(NS + key, JSON.stringify(value));
	} catch {
		/* private mode, quota, or blocked storage — state just will not survive */
	}
}

export function remove(key: string): void {
	if (!browser) return;
	try {
		localStorage.removeItem(NS + key);
	} catch {
		/* ignore */
	}
}

/**
 * Has `key`'s stored timestamp aged past `ms`?
 *
 * True when it has never been stamped, which makes "first time in 24h" and
 * "first time ever" the same branch at every call site.
 */
export function olderThan(key: string, ms: number): boolean {
	const at = readJSON<number>(key, 0);
	return !at || Date.now() - at > ms;
}

export function stamp(key: string): void {
	writeJSON(key, Date.now());
}
