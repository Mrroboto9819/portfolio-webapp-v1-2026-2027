// Delete one stored file — refused while anything still references it.
//
// A POST rather than a DELETE on the collection route: the key contains
// slashes, and a body survives proxies and logging better than a path
// segment that has to be double-encoded.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteObject, publicUrlFor, storageConfigured } from '$lib/server/s3';
import { findMediaReferences } from '$lib/server/mediaRefs';

export const POST: RequestHandler = async ({ request }) => {
	if (!storageConfigured()) error(503, 'Object storage is not configured');

	const body = await request.json().catch(() => null);
	const key = typeof body?.key === 'string' ? body.key : '';
	if (!key || key.includes('..')) error(400, 'A valid "key" is required');

	// A referenced file does not get deleted, full stop. The caller is told
	// exactly who points at it; removing or replacing those references first is
	// the deliberate act this guard exists to force.
	const refs = await findMediaReferences(publicUrlFor(key));
	if (refs.length) {
		return json(
			{
				message: `Still referenced by ${refs.length} record(s) — update them first.`,
				refs
			},
			{ status: 409 }
		);
	}

	await deleteObject(key);
	return json({ deleted: key });
};
