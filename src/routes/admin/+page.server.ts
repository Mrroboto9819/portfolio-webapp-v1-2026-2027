import type { PageServerLoad } from './$types';
import { ENTITY_ORDER } from '$lib/adminSchema';
import { getRepo } from '$lib/server/repositories';

export const load: PageServerLoad = async () => {
	const counts = await Promise.all(
		ENTITY_ORDER.map(async (name) => ({
			name,
			// activeOnly:false — the admin counts drafts and hidden rows too.
			count: (await getRepo(name).list({ activeOnly: false })).length
		}))
	);
	return { counts };
};
