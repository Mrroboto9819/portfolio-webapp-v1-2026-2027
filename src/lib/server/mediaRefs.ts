// Who points at a stored file.
//
// Media URLs live INSIDE documents — a post body's markdown, a coverImage
// field, a song's file, the profile avatar — so file operations must know who
// references a key before deleting or moving it. Deleting a referenced file
// breaks the page that embeds it silently; moving one without rewriting the
// references does the same thing slower.
//
// The scan is deliberately blunt: serialize each row and look for the URL as
// a substring. That catches a URL anywhere — a dedicated field, markdown, an
// array — without maintaining a per-entity field list that would drift. At
// this database's size (hundreds of rows) it is instant; the day it is not,
// a text index is the upgrade, not a field list.

import { ENTITY_ORDER, SCHEMAS } from '$lib/adminSchema';
import { t } from '$lib/i18n';
import { getRepo, profile } from './repositories';

export type MediaRef = { entity: string; id: string; title: string };

type Row = Record<string, unknown> & { id?: string };

function refOf(entity: string, row: Row, titleField: string): MediaRef {
	const raw = row[titleField];
	const title =
		(typeof raw === 'object' && raw !== null ? t(raw as never, 'en') : String(raw ?? '')) ||
		String(row.slug ?? row.id ?? '(untitled)');
	return { entity, id: String(row.id ?? ''), title };
}

/** Every document whose serialized form contains this URL. */
export async function findMediaReferences(url: string): Promise<MediaRef[]> {
	const refs: MediaRef[] = [];

	for (const name of ENTITY_ORDER) {
		const rows = (await getRepo(name).list({ activeOnly: false })) as Row[];
		for (const row of rows) {
			if (JSON.stringify(row).includes(url)) refs.push(refOf(name, row, SCHEMAS[name].titleField));
		}
	}

	// The profile is not an entity in ENTITY_ORDER but its avatar is a stored
	// file like any other.
	const prof = (await profile.get()) as unknown as Row;
	if (JSON.stringify(prof).includes(url)) {
		refs.push({ entity: 'profile', id: String(prof.id ?? ''), title: 'Site profile' });
	}

	return refs;
}

/**
 * Rewrite every reference from one URL to another. Runs AFTER the object has
 * been copied to its new key and BEFORE the old key is deleted, so at every
 * moment each stored URL resolves to real bytes.
 */
export async function rewriteMediaReferences(oldUrl: string, newUrl: string): Promise<number> {
	let changed = 0;

	for (const name of ENTITY_ORDER) {
		const repo = getRepo(name);
		const rows = (await repo.list({ activeOnly: false })) as Row[];
		for (const row of rows) {
			const json = JSON.stringify(row);
			if (!json.includes(oldUrl) || !row.id) continue;
			const { id: _id, ...rest } = JSON.parse(json.replaceAll(oldUrl, newUrl)) as Row;
			await repo.update(String(row.id), rest);
			changed++;
		}
	}

	const prof = (await profile.get()) as unknown as Row;
	const profJson = JSON.stringify(prof);
	if (profJson.includes(oldUrl) && prof.id) {
		const { id: _id, ...rest } = JSON.parse(profJson.replaceAll(oldUrl, newUrl)) as Row;
		await profile.update(String(prof.id), rest as never);
		changed++;
	}

	return changed;
}
