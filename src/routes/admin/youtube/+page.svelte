<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { ui, type Locale } from '$lib/i18n';
	import { readJSON, writeJSON } from '$lib/persist';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	// Editable, but the URL is the source of truth — same resync the entity
	// list's search box does, for the same back-button reason.
	let query = $state(data.q);
	$effect(() => {
		query = data.q;
	});

	// One category applies to whatever gets grabbed next; each result form
	// carries it as a hidden input. Optional.
	//
	// Remembered across navigation: filling a shelf means several searches in a
	// row, and retyping the same tag after every one is the kind of small
	// friction that ends with untagged tracks.
	const CATEGORY_KEY = 'admin-grab-category';
	let category = $state('');
	$effect(() => {
		category = readJSON<string>(CATEGORY_KEY, '');
	});

	// The id being grabbed right now. One at a time on purpose: a grab is a
	// download plus a transcode, and firing several in parallel just makes them
	// all slower and the failure messages ambiguous.
	let grabbing = $state('');
	// Ids that finished this visit, so their button flips to a done state.
	let done = $state<Set<string>>(new Set());

	// A search is a navigation, so SvelteKit already knows when one is in
	// flight — no second flag to keep in sync with it. Any navigation landing
	// back on this route is a search; arriving from elsewhere renders the
	// skeleton too, which is honest, because the results are genuinely loading.
	const searching = $derived(navigating.to?.url.pathname === '/admin/youtube');

	function submitSearch(e?: Event) {
		e?.preventDefault();
		const params = new URLSearchParams();
		if (query.trim()) params.set('q', query.trim());
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	// Enter already submits a single-input form, but only implicitly — and the
	// box sits next to a second, unrelated input, which is exactly the layout
	// where that behaviour is easy to lose. Binding it explicitly means the key
	// works regardless of what else lands in this form later.
	function onSearchKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.isComposing) return;
		submitSearch(e);
	}

	const fmtViews = (n: number) =>
		n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

	const field =
		'w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';

	const dlBtn =
		'border border-outline/40 px-3 py-1.5 text-center font-mono text-[11px] tracking-[0.08em] uppercase text-outline transition-colors hover:border-tertiary-container hover:text-tertiary-container';
</script>

<svelte:head>
	<title>Admin — {T('admin.youtube')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<h1 class="m-0 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">
			{T('admin.youtube')}
		</h1>
		<a
			href="/admin/playlist"
			class="font-mono text-xs tracking-[0.1em] text-outline uppercase hover:text-primary-container"
		>
			{T('admin.playlistLink')}
		</a>
	</div>

	{#if !data.storageOn}
		<p class="mb-4 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error">
			{T('admin.storageOff')}
		</p>
	{/if}

	<form onsubmit={submitSearch} class="mb-1.5 flex flex-wrap gap-2" role="search">
		<input
			bind:value={query}
			onkeydown={onSearchKey}
			type="search"
			enterkeyhint="search"
			placeholder={T('admin.searchYouTube')}
			aria-label={T('admin.searchYouTube')}
			aria-busy={searching}
			class="{field} max-w-md font-mono text-xs"
		/>
		<button
			type="submit"
			disabled={searching}
			class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:cursor-wait disabled:opacity-60"
		>
			{#if searching}
				<!-- Same three-bar tell the grab button uses, so "working" looks
				     the same everywhere on this page. The wording stays put; only
				     the bars move, which keeps the button from resizing. -->
				<span class="inline-flex items-center gap-2">
					<span class="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
						{#each [0, 1, 2] as b (b)}
							<span
								class="w-[2px] bg-surface"
								style="height: 100%; animation: yt-eq 700ms {b *
									130}ms ease-in-out infinite alternate"
							></span>
						{/each}
					</span>
					{T('admin.search')}
				</span>
			{:else}
				{T('admin.search')}
			{/if}
		</button>
	</form>

	<p class="mt-0 mb-6 font-mono text-[11px] text-outline">{T('admin.searchHelp')}</p>

	<div class="mb-6 flex max-w-md items-center gap-2">
		<label
			class="shrink-0 font-mono text-xs tracking-[0.1em] text-outline uppercase"
			for="grab-category"
		>
			{T('admin.tagGrabsAs')}
		</label>
		<input
			id="grab-category"
			bind:value={category}
			onchange={() => writeJSON(CATEGORY_KEY, category)}
			onblur={() => writeJSON(CATEGORY_KEY, category)}
			placeholder={T('admin.categoryPlaceholder')}
			class="{field} font-mono text-xs"
		/>
	</div>

	<!-- One status line, and `searching` outranks everything: mid-search, the
	     old "no results" or the hint are both stale answers to a question the
	     user has already replaced. -->
	{#if searching}
		<p class="font-mono text-xs text-primary-container" role="status" aria-live="polite">
			{T('admin.searching')}
		</p>
	{:else if data.searchError}
		<p
			class="border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
			role="alert"
		>
			{T('admin.searchFailed')}
			{data.searchError}
		</p>
	{:else if data.q && !data.results.length}
		<p class="font-mono text-xs text-outline">{T('admin.noResults')} “{data.q}”.</p>
	{:else if !data.q}
		<p class="font-mono text-xs text-outline">
			{T('admin.searchHint')}
		</p>
	{/if}

	{#if searching}
		<!-- Placeholder rows in the shape of real results, so the list does not
		     collapse to nothing and then jump back — the layout stays put and
		     only the content arrives. Decorative: the status line above is what
		     a screen reader announces. -->
		<ul class="m-0 flex list-none flex-col gap-3 p-0" aria-hidden="true">
			{#each [0, 1, 2, 3] as row (row)}
				<li class="glass flex flex-col gap-4 border border-white/10 p-4 sm:flex-row">
					<div class="skeleton h-24 w-40 shrink-0 border border-white/10"></div>
					<div class="min-w-0 flex-1">
						<div class="skeleton mb-2 h-4 w-3/5"></div>
						<div class="skeleton mb-3 h-3 w-2/5"></div>
						<div class="skeleton h-3 w-4/5"></div>
					</div>
					<div class="flex shrink-0 items-center">
						<div class="skeleton h-10 w-32"></div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<ul class="m-0 flex list-none flex-col gap-3 p-0">
		{#each searching ? [] : data.results as v (v.videoId)}
			<li class="glass flex flex-col gap-4 border border-white/10 p-4 sm:flex-row">
				<a
					href={v.url}
					target="_blank"
					rel="noopener noreferrer"
					class="relative block h-24 w-40 shrink-0 overflow-hidden border border-white/10"
					aria-label="Open “{v.title}” on YouTube"
				>
					<img src={v.thumbnail} alt="" class="h-full w-full object-cover" loading="lazy" />
					<span
						class="absolute right-1 bottom-1 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white"
					>
						{v.duration}
					</span>
				</a>

				<div class="min-w-0 flex-1">
					<div class="mb-1 truncate font-mono text-sm text-on-surface" title={v.title}>
						{v.title}
					</div>
					<div class="mb-2 flex flex-wrap gap-x-3 font-mono text-xs text-tertiary-container">
						<span>{v.channel}</span>
						<span class="text-outline">{fmtViews(v.views)} views</span>
						{#if v.isLive}
							<span class="text-error">{T('admin.liveStream')}</span>
						{/if}
					</div>
					{#if v.description}
						<p class="m-0 line-clamp-2 font-mono text-xs leading-relaxed text-outline">
							{v.description}
						</p>
					{/if}
				</div>

				<div class="flex shrink-0 flex-col items-stretch justify-center gap-2">
					<!-- Straight to the device, stored nowhere. Plain links rather than
					     fetch(): the browser saves the stream as it arrives, which a
					     blob would instead hold whole in memory — and an MP4 is big. -->
					{#if !v.isLive}
						<div class="flex items-center gap-1.5">
							<a
								href="/admin/youtube/download/{v.videoId}?format=mp3"
								title={T('admin.saveMp3Title')}
								class="{dlBtn} flex-1">↓ {T('admin.saveMp3')}</a
							>
							<a
								href="/admin/youtube/download/{v.videoId}?format=mp4"
								title={T('admin.saveMp4Title')}
								class="{dlBtn} flex-1">↓ {T('admin.saveMp4')}</a
							>
						</div>
					{/if}

					{#if v.isLive}
						<span class="px-4 font-mono text-xs tracking-[0.1em] text-outline uppercase">
							{T('admin.cannotGrabLive')}
						</span>
					{:else if done.has(v.videoId)}
						<span class="px-4 font-mono text-xs tracking-[0.1em] text-primary-container uppercase">
							{T('admin.inLibrary')}
						</span>
					{:else}
						<form
							method="POST"
							action="?/grab"
							use:enhance={() => {
								grabbing = v.videoId;
								return async ({ result }) => {
									grabbing = '';
									if (result.type === 'success') {
										done = new Set(done).add(v.videoId);
										toast.success(`Grabbed “${String(result.data?.grabbed ?? v.title)}”`);
									} else if (result.type === 'failure') {
										toast.error(String(result.data?.message ?? 'Grab failed'));
									}
								};
							}}
						>
							<input type="hidden" name="videoId" value={v.videoId} />
							<input type="hidden" name="category" value={category} />
							<button
								type="submit"
								disabled={Boolean(grabbing) || !data.storageOn}
								class="clip-corner border border-primary-container/60 bg-primary-container/10 px-4 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-primary-container uppercase transition-colors hover:bg-primary-container/20 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{#if grabbing === v.videoId}
									<span class="inline-flex items-center gap-2">
										<span class="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
											{#each [0, 1, 2] as b (b)}
												<span
													class="w-[2px] bg-primary-container"
													style="height: 100%; animation: yt-eq 700ms {b *
														130}ms ease-in-out infinite alternate"
												></span>
											{/each}
										</span>
										{T('admin.grabbing')}
									</span>
								{:else}
									{T('admin.addToMusic')}
								{/if}
							</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if data.results.length && !searching}
		<p class="mt-6 font-mono text-[11px] leading-snug text-outline">
			{T('admin.grabNote')}
		</p>
		<p class="mt-2 font-mono text-[11px] leading-snug text-outline">
			{T('admin.downloadNote')}
		</p>
	{/if}
</div>

<style>
	/* A shimmer rather than a spinner: it occupies the space the result will
	   occupy, which is the whole point of showing it. */
	.skeleton {
		background: linear-gradient(
			90deg,
			rgb(255 255 255 / 0.04) 25%,
			rgb(255 255 255 / 0.1) 37%,
			rgb(255 255 255 / 0.04) 63%
		);
		background-size: 400% 100%;
		animation: yt-shimmer 1.4s ease-in-out infinite;
	}
	@keyframes yt-shimmer {
		from {
			background-position: 100% 50%;
		}
		to {
			background-position: 0% 50%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}
	}

	@keyframes yt-eq {
		from {
			height: 25%;
		}
		to {
			height: 100%;
		}
	}
</style>
