// Per-document endpoint: GET / PATCH / DELETE on /api/v1/<entity>/<id>.
// Matches the same dispatch pattern as the parent +server.ts.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepo, isEntityName } from '$lib/server/repositories';
import { publicOne } from '$lib/server/publicView';
import { applyPublishPolicy } from '$lib/server/permissions';

function repoOr404(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return getRepo(name);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const repo = repoOr404(params.entity);
	const doc = publicOne(params.entity, await repo.findById(params.id), locals.session);
	// 404 rather than 403 for a draft: the same answer as a row that does not
	// exist, so the endpoint cannot be used to confirm one is being written.
	if (!doc) error(404, 'Not found');
	return json(doc);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const repo = repoOr404(params.entity);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Body must be an object');
	}
	// An update from someone who may not publish keeps every field except the
	// visibility flag — see permissions.ts for why it is dropped, not forced.
	const patch = applyPublishPolicy(locals.session, body as Record<string, unknown>, {
		creating: false
	});
	const updated = await repo.update(params.id, patch);
	if (!updated) error(404, 'Not found');
	return json(updated);
};

// PUT is a synonym for PATCH — same partial-update semantics. Lots of
// admin tools default to PUT, so accept it.
export const PUT: RequestHandler = (event) => PATCH(event);

export const DELETE: RequestHandler = async ({ params }) => {
	const repo = repoOr404(params.entity);
	const ok = await repo.remove(params.id);
	if (!ok) error(404, 'Not found');
	return json({ ok: true });
};
