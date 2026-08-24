import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { posts, social, songs } from '$lib/server/repositories';
import { renderMarkdown, excerptFrom } from '$lib/server/markdown';
import { TRANSLATABLE, localizeRecord } from '$lib/i18n';

export const load: PageServerLoad = async ({ params, locals }) => {
	const raw = await posts.bySlug(params.slug);
	if (!raw) error(404, 'Post not found');

	// A draft is reachable by direct URL only while signed in, so posts can be
	// previewed before they go live without leaking to the public.
	if (raw.status !== 'published' && !locals.session) error(404, 'Post not found');

	// Resolve the locale BEFORE rendering: the markdown pipeline must receive
	// the chosen language's source, not the { en, es } wrapper.
	const post = localizeRecord(raw, TRANSLATABLE.posts, locals.locale);

	const [socialList, songList] = await Promise.all([
		social.list({ activeOnly: true }),
		songs.list({ activeOnly: true })
	]);

	return {
		social: socialList,
		songs: songList,
		locale: locals.locale,
		post,
		html: renderMarkdown(post.body ?? ''),
		description: post.excerpt || excerptFrom(post.body ?? ''),
		isDraft: post.status !== 'published'
	};
};
