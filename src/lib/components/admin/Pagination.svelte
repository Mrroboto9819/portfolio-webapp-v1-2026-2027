<script lang="ts">
	import { page as pageState } from '$app/state';

	// Paging lives in the URL, not component state: the back button works, a
	// page can be linked or refreshed, and the server does the slicing.
	let {
		page,
		pages,
		total,
		perPage
	}: { page: number; pages: number; total: number; perPage: number } = $props();

	function hrefFor(n: number): string {
		const params = new URLSearchParams(pageState.url.searchParams);
		if (n <= 1) params.delete('page');
		else params.set('page', String(n));
		const qs = params.toString();
		return qs ? `?${qs}` : pageState.url.pathname;
	}

	// A short window around the current page, always including first and last.
	const windowed = $derived.by(() => {
		const span = new Set<number>([1, pages, page - 1, page, page + 1]);
		return [...span].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
	});

	const from = $derived(total === 0 ? 0 : (page - 1) * perPage + 1);
	const to = $derived(Math.min(page * perPage, total));
	const btn =
		'border border-outline/40 px-3 py-1.5 font-mono text-xs transition-colors hover:border-primary-container hover:text-primary-container';
</script>

{#if total > 0}
	<nav class="flex flex-wrap items-center justify-between gap-3 pt-4" aria-label="Pagination">
		<span class="font-mono text-xs text-outline">
			{from}–{to} of {total}
		</span>

		{#if pages > 1}
			<div class="flex flex-wrap items-center gap-1.5">
				{#if page > 1}
					<a href={hrefFor(page - 1)} class={btn} rel="prev">Prev</a>
				{:else}
					<span class="{btn} cursor-not-allowed opacity-40" aria-disabled="true">Prev</span>
				{/if}

				{#each windowed as n, i (n)}
					{#if i > 0 && n - windowed[i - 1] > 1}
						<span class="px-1 font-mono text-xs text-outline">…</span>
					{/if}
					{#if n === page}
						<span
							class="border border-primary-container bg-primary-container/10 px-3 py-1.5 font-mono text-xs text-primary-container"
							aria-current="page">{n}</span
						>
					{:else}
						<a href={hrefFor(n)} class={btn}>{n}</a>
					{/if}
				{/each}

				{#if page < pages}
					<a href={hrefFor(page + 1)} class={btn} rel="next">Next</a>
				{:else}
					<span class="{btn} cursor-not-allowed opacity-40" aria-disabled="true">Next</span>
				{/if}
			</div>
		{/if}
	</nav>
{/if}
