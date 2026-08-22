// Generic list + create endpoint for any whitelisted entity.
//
// SOLID note (Single Responsibility): this file only translates HTTP ↔
// repository calls. No validation rules, no business logic, no auth — those
// are concerns for separate layers (a future `validators/` module + a
// `hooks.server.ts` auth gate for /api/v1/admin/*).

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepo, isEntityName } from '$lib/server/repositories';

function repoOr404(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return getRepo(name);
}

export const GET: RequestHandler = async ({ params, url }) => {
	const repo = repoOr404(params.entity);
	const all = url.searchParams.get('all') === 'true';
	const items = await repo.list({ activeOnly: !all });
	return json({ items });
};

export const POST: RequestHandler = async ({ params, request }) => {
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
	const created = await repo.create(body as Record<string, unknown>);
	return json(created, { status: 201 });
};
