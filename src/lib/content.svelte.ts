// The rendered page's data, in one place.
//
// SvelteKit's `load` stays the source of truth — it runs on the server, it is
// what SSR renders from, and it re-runs on every navigation. This store does
// not replace it and never fetches anything itself: each route hands its data
// here once per navigation, and everything that needs it reads the same
// accessors instead of each component inventing its own lookup.
//
// The point is standardisation, not caching. `sectionFor`, `postBySlug` and
// `songs` used to live as one-off helpers or props threaded through three
// levels of component; a stale copy of server data would be a bug, so
// `hydrate` overwrites wholesale rather than merging.

import type { Locale } from '$lib/i18n';
import type { Post, Profile, Section, SectionKey, Social, Song } from '$lib/types';

/**
 * Everything a route may hand over. All optional: the landing page has
 * sections and a profile, the blog index has posts, a post page has one post —
 * each route fills in what it loaded and clears the rest.
 */
export type RenderData = {
	locale: Locale;
	profile: Profile | null;
	sections: Section[];
	social: Social[];
	songs: Song[];
	/** The published list, as shown by the blog index (already filtered). */
	posts: Post[];
	/** The single post being read, on /blog/[slug]. */
	post: Post | null;
	/** That post's body, already rendered and sanitised on the server. */
	postHtml: string;
};

class Content {
	locale = $state<Locale>('en');
	profile = $state<Profile | null>(null);
	sections = $state<Section[]>([]);
	social = $state<Social[]>([]);
	songs = $state<Song[]>([]);
	posts = $state<Post[]>([]);
	post = $state<Post | null>(null);
	postHtml = $state('');

	/**
	 * Take the current route's load data.
	 *
	 * Call it from an `$effect` so it re-runs on navigation. Anything the route
	 * did not load resets to empty — leaving the previous page's posts behind
	 * would make `content.posts` mean "whatever was loaded most recently",
	 * which is exactly the kind of ambiguity this store exists to remove.
	 */
	hydrate(data: Partial<RenderData>) {
		this.locale = data.locale ?? 'en';
		this.profile = data.profile ?? null;
		this.sections = data.sections ?? [];
		this.social = data.social ?? [];
		this.songs = data.songs ?? [];
		this.posts = data.posts ?? [];
		this.post = data.post ?? null;
		this.postHtml = data.postHtml ?? '';
	}

	/**
	 * Look a homepage section up by key.
	 *
	 * Null when the admin has hidden or removed it — which is how a block
	 * disappears from the page, so callers must handle it.
	 */
	sectionFor(key: SectionKey | string): Section | null {
		return this.sections.find((s) => s.key === key) ?? null;
	}

	postBySlug(slug: string): Post | null {
		return this.posts.find((p) => p.slug === slug) ?? null;
	}

	get hasMusic(): boolean {
		return this.songs.length > 0;
	}
}

export const content = new Content();
