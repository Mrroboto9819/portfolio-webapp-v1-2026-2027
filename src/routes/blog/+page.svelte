<script lang="ts">
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import MusicPlayer from '$lib/components/MusicPlayer.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { ui } from '$lib/i18n';
	import { content } from '$lib/content.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import { revealStagger } from '$lib/motion';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Hand this route's load data to the shared content store, so the player,
	// the drawer and anything else that needs it read one standardised shape
	// instead of receiving the same values as props down three levels. It is an
	// effect, not a one-off call: `data` is replaced on every navigation.
	$effect(() => {
		content.hydrate({
			locale: data.locale,
			social: data.social,
			songs: data.songs,
			posts: data.posts
		});
	});

	// The URL is the source of truth; the box only mirrors it, so back and
	// refresh cannot leave a stale term above a differently-filtered list.
	let q = $state(data.filters.q);
	$effect(() => {
		q = data.filters.q;
	});

	function submitSearch(e: Event) {
		e.preventDefault();
		const params = new URLSearchParams(pageState.url.searchParams);
		if (q.trim()) params.set('blog_q', q.trim());
		else params.delete('blog_q');
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	const fmt = (iso?: string) =>
		iso
			? new Date(iso).toLocaleDateString('en-GB', {
					day: '2-digit',
					month: 'short',
					year: 'numeric'
				})
			: '';
</script>

<Seo
	title="Blog — Pablo Cabrera"
	description="Notes on engineering, infrastructure and the web, by Pablo Cabrera."
	locale={data.locale}
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Blog',
		name: 'Pablo Cabrera — Blog',
		description: 'Notes on engineering, infrastructure and the web.',
		author: { '@type': 'Person', name: 'Pablo Cabrera' },
		blogPost: data.posts.map((p) => ({
			'@type': 'BlogPosting',
			headline: p.title,
			description: p.excerpt,
			datePublished: p.publishedAt,
			url: `/blog/${p.slug}`
		}))
	}}
/>

<div class="crt" aria-hidden="true"></div>
<Atmosphere />
<Nav social={data.social} locale={data.locale} songs={data.songs} />
<Toaster />

<main
	class="relative z-10 mx-auto min-h-dvh max-w-(--container-max) px-margin-mobile pt-24 pb-16 md:px-margin-desktop"
>
	<SectionHeading title="Blog" sub="Notes on engineering &amp; infrastructure" />

	<form onsubmit={submitSearch} role="search" class="mb-5 flex flex-wrap gap-2">
		<input
			bind:value={q}
			placeholder="Search posts…"
			aria-label="Search posts"
			class="min-w-0 flex-1 border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-xs text-on-surface outline-none focus:border-primary-container sm:max-w-xs"
		/>
		<button
			type="submit"
			class="border border-outline/40 px-4 font-mono text-xs uppercase transition-colors hover:border-primary-container hover:text-primary-container"
		>
			Search
		</button>
		{#if data.filters.active}
			<a
				href={pageState.url.pathname}
				data-sveltekit-noscroll
				class="flex items-center px-3 font-mono text-xs text-outline transition-colors hover:text-primary-container"
			>
				{ui('filter.clear', data.locale)}
			</a>
		{/if}
	</form>

	{#if data.filters.tagOptions.length > 1}
		<FilterBar
			param="blog_tag"
			label="Tags"
			active={data.filters.tag}
			options={data.filters.tagOptions}
			locale={data.locale}
		/>
	{/if}

	{#if data.filters.active}
		<p class="mb-6 font-mono text-xs text-on-surface-variant">
			{ui('filter.showing', data.locale)}
			<span class="text-primary-container">{data.posts.length}</span>
			{ui('filter.of', data.locale)}
			{data.filters.total}
		</p>
	{/if}

	{#if data.posts.length}
		<div class="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3" use:revealStagger>
			{#each data.posts as post (post.id)}
				<a href="/blog/{post.slug}" class="block">
					<HudPanel class="game-hover flex h-full flex-col gap-3 p-6">
						{#if post.coverImage}
							<img
								src={post.coverImage}
								alt=""
								class="mb-1 h-40 w-full border border-white/10 object-cover"
								loading="lazy"
								decoding="async"
							/>
						{/if}
						<div class="flex items-center gap-3 font-mono text-xs text-outline">
							{#if post.status !== 'published'}
								<!-- Only ever present for a signed-in super-admin: the server
								     never hands drafts to anyone else. -->
								<span class="border border-secondary/60 px-1.5 py-0.5 font-bold text-secondary">
									DRAFT
								</span>
							{:else}
								<span>{fmt(post.publishedAt)}</span>
							{/if}
							{#if post.readingMinutes}
								<span class="text-tertiary-container">{post.readingMinutes} MIN</span>
							{/if}
						</div>
						<h2
							class="m-0 line-clamp-2 text-lg leading-snug font-bold tracking-[-0.01em] text-on-surface"
						>
							{post.title}
						</h2>
						{#if post.excerpt}
							<!-- Clamped to keep every card the same height in the grid;
							     the full summary is one click away. -->
							<p class="m-0 line-clamp-4 grow text-sm leading-relaxed text-on-surface-variant">
								{post.excerpt}
							</p>
						{/if}
						{#if post.tags?.length}
							<ul class="flex list-none flex-wrap gap-1.5 p-0">
								{#each post.tags as t (t)}
									<li class="border border-outline/30 px-2 py-1 font-mono text-xs text-outline">
										#{t}
									</li>
								{/each}
							</ul>
						{/if}
					</HudPanel>
				</a>
			{/each}
		</div>
	{:else}
		<HudPanel class="p-8">
			<p class="m-0 font-mono text-sm text-on-surface-variant">
				<span class="text-secondary">[SYS]</span>
				{#if data.filters.active}
					No posts match that filter. <a
						href={pageState.url.pathname}
						class="text-primary-container underline underline-offset-4">Clear it</a
					>
					to see all {data.filters.total}.
				{:else}
					No posts published yet.
				{/if}
			</p>
		</HudPanel>
	{/if}
</main>

<MusicPlayer songs={data.songs} />

<Footer />
