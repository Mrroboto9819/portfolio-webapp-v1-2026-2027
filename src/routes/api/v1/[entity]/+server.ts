// Generic list + create endpoint for any whitelisted entity.
//
// SOLID note (Single Responsibility): this file only translates HTTP ↔
// repository calls. No validation rules, no business logic, no auth — those
// are concerns for separate layers (a future `validators/` module + a
// `hooks.server.ts` auth gate for /api/v1/admin/*).

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepo, isEntityName } from '$lib/server/repositories';
import { mayListInactive, publicFilter } from '$lib/server/publicView';
import { applyPublishPolicy } from '$lib/server/permissions';

function repoOr404(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return getRepo(name);
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const repo = repoOr404(params.entity);
	// `all=true` is an ADMIN view — it returns rows that were deliberately
	// deactivated. Anonymous callers get the active set whatever they ask for.
	const all = url.searchParams.get('all') === 'true' && mayListInactive(locals.session);
	const items = await repo.list({ activeOnly: !all });
	return json({ items: publicFilter(params.entity, items, locals.session) });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
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
	// Who may write here at all is settled in hooks; what they may make PUBLIC
	// is settled here, so the API cannot be the way around the admin's rule.
	const patch = applyPublishPolicy(locals.session, body as Record<string, unknown>, {
		creating: true
	});
	const created = await repo.create(patch);
	return json(created, { status: 201 });
};
