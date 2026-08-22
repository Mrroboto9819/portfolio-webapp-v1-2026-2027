<script lang="ts">
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import { revealStagger } from '$lib/motion';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const fmt = (iso?: string) =>
		iso
			? new Date(iso).toLocaleDateString('en-GB', {
					day: '2-digit',
					month: 'short',
					year: 'numeric'
				})
			: '';
</script>

<svelte:head>
	<title>Blog — Pablo Cabrera</title>
	<meta name="description" content="Notes on engineering, infrastructure and the web." />
</svelte:head>

<div class="crt" aria-hidden="true"></div>
<Atmosphere />
<Nav />

<main
	class="relative z-10 mx-auto min-h-dvh max-w-(--container-max) px-margin-mobile pt-24 pb-16 md:px-margin-desktop"
>
	<SectionHeading title="Blog" sub="Notes on engineering &amp; infrastructure" />

	{#if data.posts.length}
		<div class="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3" use:revealStagger>
			{#each data.posts as post (post.id)}
				<a href="/blog/{post.slug}" class="block">
					<HudPanel class="game-hover flex h-full flex-col gap-3 p-6">
						{#if post.coverImage}
							<img
								src={post.coverImage}
								alt=""
								class="mb-1 h-36 w-full object-cover"
								loading="lazy"
								decoding="async"
							/>
						{/if}
						<div class="flex items-center gap-3 font-mono text-xs text-outline">
							<span>{fmt(post.publishedAt)}</span>
							{#if post.readingMinutes}
								<span class="text-tertiary-container">{post.readingMinutes} MIN</span>
							{/if}
						</div>
						<h2 class="m-0 text-lg font-bold tracking-[-0.01em] text-on-surface">{post.title}</h2>
						{#if post.excerpt}
							<p class="m-0 grow text-sm leading-relaxed text-on-surface-variant">{post.excerpt}</p>
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
				<span class="text-secondary">[SYS]</span> No posts published yet.
			</p>
		</HudPanel>
	{/if}
</main>

<Footer />
