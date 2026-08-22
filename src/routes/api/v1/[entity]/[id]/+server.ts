// Per-document endpoint: GET / PATCH / DELETE on /api/v1/<entity>/<id>.
// Matches the same dispatch pattern as the parent +server.ts.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepo, isEntityName } from '$lib/server/repositories';

function repoOr404(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return getRepo(name);
}

export const GET: RequestHandler = async ({ params }) => {
	const repo = repoOr404(params.entity);
	const doc = await repo.findById(params.id);
	if (!doc) error(404, 'Not found');
	return json(doc);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
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
	const updated = await repo.update(params.id, body as Record<string, unknown>);
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
