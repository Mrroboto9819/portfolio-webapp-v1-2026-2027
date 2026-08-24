// Full content export / import.
//
// The point is portability: everything that makes this site *this* site lives
// in Mongo, so a single JSON file plus the object store is the whole thing.
// That makes it a backup, a way to seed production from beta, and the migration
// path when this moves to AWS.
//
// Media is NOT inlined. The database stores links, so an export carries links —
// base64-ing a 6MB mp3 into a config file would produce something unusable.
// `assets` lists every referenced URL so the object store can be synced
// alongside.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENTITIES, profile } from '$lib/server/repositories';
import type { EntityName } from '$lib/types';

const VERSION = 1;

/** Pull every /cdn/ link out of an arbitrary record, at any depth. */
function collectAssets(value: unknown, into: Set<string>) {
	if (typeof value === 'string') {
		for (const m of value.matchAll(/\/cdn\/[A-Za-z0-9._\-/]+/g)) into.add(m[0]);
		return;
	}
	if (Array.isArray(value)) return value.forEach((v) => collectAssets(v, into));
	if (value && typeof value === 'object') {
		return Object.values(value).forEach((v) => collectAssets(v, into));
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const assets = new Set<string>();
	const data: Record<string, unknown> = {};

	for (const name of Object.keys(ENTITIES) as EntityName[]) {
		// activeOnly:false — an export must include hidden rows and drafts, or
		// restoring it silently loses work.
		const rows = await ENTITIES[name].list({ activeOnly: false });
		data[name] = rows;
		collectAssets(rows, assets);
	}

	const me = await profile.get();
	collectAssets(me, assets);

	const payload = {
		version: VERSION,
		exportedAt: new Date().toISOString(),
		origin: url.origin,
		profile: me,
		data,
		// Absolute, so a restore on another host knows where to fetch them from.
		assets: [...assets].sort().map((path) => ({ path, url: `${url.origin}${path}` })),
		counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length]))
	};

	const stamp = new Date().toISOString().slice(0, 10);
	return json(payload, {
		headers: {
			'content-disposition': `attachment; filename="portafolio-export-${stamp}.json"`,
			'cache-control': 'no-store'
		}
	});
};

export const POST: RequestHandler = async ({ request }) => {
	let payload: {
		version?: number;
		profile?: Record<string, unknown>;
		data?: Record<string, Record<string, unknown>[]>;
	};
	try {
		payload = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	if (payload.version !== VERSION) {
		error(400, `Unsupported export version ${payload.version ?? '(none)'}; expected ${VERSION}`);
	}
	if (!payload.data || typeof payload.data !== 'object') error(400, 'Missing "data"');

	const report: Record<string, { created: number; updated: number; skipped: number }> = {};

	for (const [name, rows] of Object.entries(payload.data)) {
		if (!(name in ENTITIES) || !Array.isArray(rows)) continue;
		const repo = ENTITIES[name as EntityName];
		const r = { created: 0, updated: 0, skipped: 0 };

		for (const row of rows) {
			const {
				id,
				createdAt: _c,
				updatedAt: _u,
				...fields
			} = row as Record<string, unknown> & {
				id?: string;
			};
			try {
				// Upsert by id: re-importing the same file is idempotent rather
				// than duplicating everything.
				if (id && (await repo.findById(String(id)))) {
					await repo.update(String(id), fields);
					r.updated++;
				} else {
					await repo.create(fields);
					r.created++;
				}
			} catch {
				r.skipped++;
			}
		}
		report[name] = r;
	}

	if (payload.profile) {
		const { id: _i, createdAt: _c, updatedAt: _u, ...fields } = payload.profile;
		await profile.save(fields);
	}

	return json({ ok: true, report });
};
