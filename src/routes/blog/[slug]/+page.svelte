<script lang="ts">
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const fmt = (iso?: string) =>
		iso
			? new Date(iso).toLocaleDateString('en-GB', {
					day: '2-digit',
					month: 'long',
					year: 'numeric'
				})
			: '';
</script>

<svelte:head>
	<title>{data.post.title} — Pablo Cabrera</title>
	<meta name="description" content={data.description} />
	<meta property="og:title" content={data.post.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:type" content="article" />
	{#if data.isDraft}<meta name="robots" content="noindex, nofollow" />{/if}
</svelte:head>

<div class="crt" aria-hidden="true"></div>
<Atmosphere />
<Nav social={data.social} locale={data.locale} songs={data.songs} />

<main
	class="relative z-10 mx-auto min-h-dvh max-w-3xl px-margin-mobile pt-24 pb-20 md:px-margin-desktop"
>
	<a
		href="/blog"
		class="mb-8 inline-block font-mono text-xs tracking-[0.1em] text-outline uppercase transition-colors hover:text-primary-container"
	>
		&larr; All posts
	</a>

	{#if data.isDraft}
		<p
			class="mb-6 border border-secondary/40 bg-secondary/10 px-3 py-2 font-mono text-xs text-secondary"
		>
			DRAFT — visible to you only.
		</p>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-4 font-mono text-xs text-outline">
		<span>{fmt(data.post.publishedAt)}</span>
		{#if data.post.readingMinutes}
			<span class="text-tertiary-container">{data.post.readingMinutes} MIN READ</span>
		{/if}
	</div>

	<h1
		class="glow-hero m-0 mb-8 text-3xl leading-[1.12] font-extrabold tracking-[-0.03em] text-primary md:text-[42px]"
	>
		{data.post.title}
	</h1>

	{#if data.post.coverImage}
		<img
			src={data.post.coverImage}
			alt=""
			class="mb-10 w-full border border-white/10 object-cover"
			loading="eager"
			decoding="async"
		/>
	{/if}

	<!--
		`html` is markdown rendered AND sanitised on the server
		(src/lib/server/markdown.ts). Never render a post body without that pass.
	-->
	<article class="prose-neon">
		{@html data.html}
	</article>

	{#if data.post.tags?.length}
		<ul class="mt-12 flex list-none flex-wrap gap-2 p-0">
			{#each data.post.tags as t (t)}
				<li class="border border-outline/30 px-2.5 py-1 font-mono text-xs text-outline">#{t}</li>
			{/each}
		</ul>
	{/if}
</main>

<Footer />
