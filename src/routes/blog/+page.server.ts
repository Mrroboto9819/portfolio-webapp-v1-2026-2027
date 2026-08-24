import type { PageServerLoad } from './$types';
import { posts, social, songs } from '$lib/server/repositories';
import { TRANSLATABLE, localizeRecord } from '$lib/i18n';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Only published posts, newest first — drafts never leave the admin.
	// Social and songs come along so the shared nav and drawer behave the same
	// here as on the landing rather than rendering a stripped-down version.
	const [postList, socialList, songList] = await Promise.all([
		posts.published(),
		social.list({ activeOnly: true }),
		songs.list({ activeOnly: true })
	]);

	// Posts carry { en, es } on title, excerpt and body. Resolve them here, or
	// the card renders the object itself as [object Object].
	const localized = postList.map((p) => localizeRecord(p, TRANSLATABLE.posts, locals.locale));

	// ---- filters: query parameters, so a filtered view is a shareable link ----
	// Namespaced blog_* to match the cert_* convention and stay collision-free.
	const tagParam = url.searchParams.get('blog_tag');
	const q = (url.searchParams.get('blog_q') ?? '').trim();
	const needle = q.toLowerCase();

	// Tag counts come from the WHOLE published set, not the search result, so a
	// chip's number does not change under you as you type.
	const tagCounts = new Map<string, number>();
	for (const p of localized) {
		for (const t of p.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
	}
	const tagOptions = [...tagCounts.entries()]
		.map(([value, count]) => ({ value, label: `#${value}`, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

	const tag = tagParam && tagCounts.has(tagParam) ? tagParam : null;

	// Search covers title and excerpt only. Matching the whole body would return
	// posts whose relevance the reader cannot see from the card.
	const filtered = localized.filter((p) => {
		if (tag && !(p.tags ?? []).includes(tag)) return false;
		if (!needle) return true;
		return (
			String(p.title ?? '')
				.toLowerCase()
				.includes(needle) ||
			String(p.excerpt ?? '')
				.toLowerCase()
				.includes(needle)
		);
	});

	return {
		posts: filtered,
		social: socialList,
		songs: songList,
		locale: locals.locale,
		filters: {
			tag,
			q,
			tagOptions,
			active: Boolean(tag || q),
			total: localized.length
		}
	};
};
