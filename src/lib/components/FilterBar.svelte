<script lang="ts">
	import { page } from '$app/state';
	import { ui, DEFAULT_LOCALE, type Locale } from '$lib/i18n';

	// Filters are links that set a query parameter, not client-side state.
	//
	// That is the whole point: the resulting URL can be pasted into a CV or an
	// application so a recruiter lands on exactly the slice you chose, and it
	// still works with JS disabled, in a crawler, and in the back button.
	let {
		param,
		options,
		active,
		label,
		locale = DEFAULT_LOCALE
	}: {
		param: string;
		options: { value: string; label: string; count?: number }[];
		active: string | null;
		label: string;
		locale?: Locale;
	} = $props();

	function hrefFor(value: string | null): string {
		const params = new URLSearchParams(page.url.searchParams);
		if (value === null || value === active) params.delete(param);
		else params.set(param, value);
		const qs = params.toString();
		// No #hash and data-sveltekit-noscroll on the links: clicking a filter
		// used to jump the reader to the top of the page, which is exactly what
		// you do not want when the thing you are filtering is below the fold.
		return `${page.url.pathname}${qs ? `?${qs}` : ''}`;
	}
</script>

<div class="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label={label}>
	<span class="mr-1 font-mono text-xs tracking-[0.1em] text-outline uppercase">{label}</span>

	<a
		href={hrefFor(null)}
		data-sveltekit-noscroll
		aria-current={active === null ? 'true' : undefined}
		class="border px-3 py-1.5 font-mono text-xs tracking-[0.08em] uppercase transition-colors {active ===
		null
			? 'border-primary-container bg-primary-container/10 text-primary-container'
			: 'border-outline/40 text-outline hover:border-primary-container hover:text-primary-container'}"
	>
		{ui('filter.all', locale)}
	</a>

	{#each options as opt (opt.value)}
		{@const on = active === opt.value}
		<a
			href={hrefFor(opt.value)}
			data-sveltekit-noscroll
			aria-current={on ? 'true' : undefined}
			class="border px-3 py-1.5 font-mono text-xs tracking-[0.08em] uppercase transition-colors {on
				? 'border-primary-container bg-primary-container/10 text-primary-container'
				: 'border-outline/40 text-outline hover:border-primary-container hover:text-primary-container'}"
		>
			{opt.label}
			{#if opt.count !== undefined}
				<span class="ml-1.5 opacity-60">{opt.count}</span>
			{/if}
		</a>
	{/each}
</div>
