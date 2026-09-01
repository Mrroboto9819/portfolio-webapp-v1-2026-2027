import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isSuper } from '$lib/server/permissions';
import { listObjects, storageConfigured } from '$lib/server/s3';

export const load: PageServerLoad = async ({ locals }) => {
	// adminGuard already turned a music-only admin away from this path; this is
	// the belt to that suspender, because the page lists every stored file.
	if (!isSuper(locals.session)) error(404, 'Not found');

	if (!storageConfigured()) return { configured: false as const, objects: [] };

	// Live from the bucket on every load — the refresh button is just
	// invalidateAll(), so the numbers are as real-time as a request can be.
	return { configured: true as const, objects: await listObjects() };
};
