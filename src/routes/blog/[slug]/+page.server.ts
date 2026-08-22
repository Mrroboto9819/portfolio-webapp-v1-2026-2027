import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { posts } from '$lib/server/repositories';
import { renderMarkdown, excerptFrom } from '$lib/server/markdown';

export const load: PageServerLoad = async ({ params, locals }) => {
	const post = await posts.bySlug(params.slug);
	if (!post) error(404, 'Post not found');

	// A draft is reachable by direct URL only while signed in, so posts can be
	// previewed before they go live without leaking to the public.
	if (post.status !== 'published' && !locals.session) error(404, 'Post not found');

	return {
		post,
		html: renderMarkdown(post.body ?? ''),
		description: post.excerpt || excerptFrom(post.body ?? ''),
		isDraft: post.status !== 'published'
	};
};
