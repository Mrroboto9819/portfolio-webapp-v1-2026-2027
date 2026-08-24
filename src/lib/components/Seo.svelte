<script lang="ts">
	import { page } from '$app/state';
	import { LOCALES, type Locale } from '$lib/i18n';

	// One place for every head tag, so a new page cannot ship with half of them.
	// JSON-LD is passed in already-built by the caller, because the right schema
	// depends on what the page IS — a Person, a Blog, a BlogPosting.
	let {
		title,
		description,
		locale = 'en',
		image,
		type = 'website',
		publishedAt,
		modifiedAt,
		tags = [],
		noindex = false,
		jsonLd
	}: {
		title: string;
		description: string;
		locale?: Locale;
		image?: string;
		type?: 'website' | 'article' | 'profile';
		publishedAt?: string;
		modifiedAt?: string;
		tags?: string[];
		/** Drafts and previews must never be indexed. */
		noindex?: boolean;
		jsonLd?: Record<string, unknown>;
	} = $props();

	const origin = $derived(page.url.origin);

	// Canonical WITHOUT ?lang: the language variants are the same document, and
	// declaring them as alternates rather than separate canonicals is what stops
	// them competing with each other in search.
	const canonical = $derived(`${origin}${page.url.pathname}`);
	const absImage = $derived(
		image ? (image.startsWith('http') ? image : `${origin}${image}`) : `${origin}/yo.webp`
	);
	const ogLocale = $derived(locale === 'es' ? 'es_MX' : 'en_US');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<!-- Same content, two languages: alternates keep them from competing. -->
	{#each LOCALES as l (l)}
		<link rel="alternate" hreflang={l} href="{canonical}?lang={l}" />
	{/each}
	<link rel="alternate" hreflang="x-default" href={canonical} />

	<meta
		name="robots"
		content={noindex
			? 'noindex, nofollow'
			: 'index, follow, max-image-preview:large, max-snippet:-1'}
	/>
	<meta name="author" content="Pablo Cabrera" />

	<meta property="og:site_name" content="Pablo Cabrera" />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={absImage} />
	<meta property="og:locale" content={ogLocale} />
	{#each LOCALES.filter((l) => l !== locale) as alt (alt)}
		<meta property="og:locale:alternate" content={alt === 'es' ? 'es_MX' : 'en_US'} />
	{/each}

	{#if type === 'article'}
		{#if publishedAt}<meta property="article:published_time" content={publishedAt} />{/if}
		{#if modifiedAt}<meta property="article:modified_time" content={modifiedAt} />{/if}
		{#each tags as tag (tag)}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={absImage} />

	{#if jsonLd}
		{@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`}
	{/if}
</svelte:head>
