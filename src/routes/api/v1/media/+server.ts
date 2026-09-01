// Media inventory: every stored file, grouped into albums (top-level
// prefixes), with live counts and sizes straight from the bucket.
//
// GET here is NOT public — hooks.server.ts lists /api/v1/media among the
// admin-only prefixes, because the listing includes drafts' images and
// whatever else was uploaded but never published. Mutations live in
// ./delete and ./move and go through the write guard like every other API
// write.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listObjects, storageConfigured } from '$lib/server/s3';

export const GET: RequestHandler = async ({ url }) => {
	if (!storageConfigured()) error(503, 'Object storage is not configured');

	const prefix = url.searchParams.get('prefix') ?? undefined;
	const objects = await listObjects(prefix);

	// Albums are the top-level folders buildKey() writes into: posts/, songs/,
	// uploads/ … A key with no slash lands in the pseudo-album "(root)".
	const albums = new Map<string, { count: number; bytes: number }>();
	for (const o of objects) {
		const folder = o.key.includes('/') ? o.key.slice(0, o.key.indexOf('/')) : '(root)';
		const a = albums.get(folder) ?? { count: 0, bytes: 0 };
		a.count += 1;
		a.bytes += o.size;
		albums.set(folder, a);
	}

	return json({
		objects,
		albums: [...albums.entries()]
			.map(([name, a]) => ({ name, ...a }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		totals: {
			count: objects.length,
			bytes: objects.reduce((sum, o) => sum + o.size, 0)
		}
	});
};
