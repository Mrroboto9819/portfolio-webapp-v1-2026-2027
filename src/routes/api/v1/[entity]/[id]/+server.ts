// Per-document endpoint: GET / PATCH / DELETE on /api/v1/<entity>/<id>.
// Matches the same dispatch pattern as the parent +server.ts.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepo, isEntityName } from '$lib/server/repositories';
import { publicOne } from '$lib/server/publicView';
import { applyPublishPolicy, ownsSong } from '$lib/server/permissions';

function repoOr404(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return getRepo(name);
}

/**
 * Refuse a song that belongs to someone else, as a 404.
 *
 * Not 403, for the same reason a draft is a 404 above: the answer for "not
 * yours" and "does not exist" has to be identical, or the endpoint becomes a
 * way to enumerate what other admins have grabbed. Non-song entities are
 * unaffected — ownership is a concept only this collection has.
 */
async function ownedOr404(
	entity: string,
	doc: Record<string, unknown> | null,
	session: App.Locals['session']
) {
	if (entity !== 'songs') return;
	if (!ownsSong(session, doc as { owner?: string } | null)) error(404, 'Not found');
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const repo = repoOr404(params.entity);
	const found = await repo.findById(params.id);
	// Signed-in callers are scoped by ownership; anonymous ones fall through to
	// publicOne(), which answers with published rows only.
	if (locals.session)
		await ownedOr404(params.entity, found as Record<string, unknown>, locals.session);
	const doc = publicOne(params.entity, found, locals.session);
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
	await ownedOr404(
		params.entity,
		(await repo.findById(params.id)) as Record<string, unknown>,
		locals.session
	);
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

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const repo = repoOr404(params.entity);
	await ownedOr404(
		params.entity,
		(await repo.findById(params.id)) as Record<string, unknown>,
		locals.session
	);
	const ok = await repo.remove(params.id);
	if (!ok) error(404, 'Not found');
	return json({ ok: true });
};
