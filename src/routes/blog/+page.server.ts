import type { PageServerLoad } from './$types';
import { posts } from '$lib/server/repositories';

export const load: PageServerLoad = async () => {
	// Only published posts, newest first — drafts never leave the admin.
	return { posts: await posts.published() };
};
