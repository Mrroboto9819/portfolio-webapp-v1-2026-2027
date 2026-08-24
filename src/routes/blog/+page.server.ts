import type { PageServerLoad } from './$types';
import { posts, social, songs } from '$lib/server/repositories';

export const load: PageServerLoad = async ({ locals }) => {
	// Only published posts, newest first — drafts never leave the admin.
	// Social and songs come along so the shared nav and drawer behave the same
	// here as on the landing rather than rendering a stripped-down version.
	const [postList, socialList, songList] = await Promise.all([
		posts.published(),
		social.list({ activeOnly: true }),
		songs.list({ activeOnly: true })
	]);
	return { posts: postList, social: socialList, songs: songList, locale: locals.locale };
};
