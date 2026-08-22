// The profile singleton. Kept OUT of /api/v1/[entity] on purpose: that route
// is list/create semantics over a collection, and this is one document with
// get/save semantics. Forcing it through the generic route would mean exposing
// a create/delete surface for a row that must always exist exactly once.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { profile, ProfileRepo } from '$lib/server/repositories';
import type { MetaEntry } from '$lib/types';

export const GET: RequestHandler = async () => json(await profile.get());

export const PATCH: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Body must be an object');
	}

	const patch = { ...(body as Record<string, unknown>) };
	if ('metadata' in patch) {
		patch.metadata = ProfileRepo.cleanMetadata(patch.metadata as MetaEntry[]);
	}

	return json(await profile.save(patch));
};

export const PUT: RequestHandler = (event) => PATCH(event);
