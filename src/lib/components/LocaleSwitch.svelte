<script lang="ts">
	import { page } from '$app/state';
	import { LOCALES, LOCALE_LABEL, LOCALE_NAME, type Locale } from '$lib/i18n';

	let { current }: { current: Locale } = $props();

	// A link, not a click handler: ?lang= is what pins the language, so the
	// switch produces a URL that behaves the same for whoever receives it.
	// data-sveltekit-noscroll keeps the reader where they were.
	function hrefFor(l: Locale): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('lang', l);
		return `${page.url.pathname}?${params}`;
	}
</script>

<div class="flex items-center border border-outline/40" role="group" aria-label="Language">
	{#each LOCALES as l (l)}
		{@const on = l === current}
		<a
			href={hrefFor(l)}
			data-sveltekit-noscroll
			hreflang={l}
			aria-label={LOCALE_NAME[l]}
			aria-current={on ? 'true' : undefined}
			class="px-2.5 py-1 font-mono text-xs tracking-[0.1em] transition-colors {on
				? 'bg-primary-container/15 text-primary-container'
				: 'text-outline hover:text-primary-container'}"
		>
			{LOCALE_LABEL[l]}
		</a>
	{/each}
</div>
