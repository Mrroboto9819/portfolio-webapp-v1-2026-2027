<script lang="ts">
	import { page } from '$app/state';
	import { LOCALES, LOCALE_LABEL, LOCALE_NAME, type Locale } from '$lib/i18n';

	let { current }: { current: Locale } = $props();

	// Which flag stands for which language here. Spanish is Mexico, not Spain —
	// this is a Mexican portfolio and the Spanish on it is Mexican.
	//
	// Rendered as plain <img>, never through Icon.svelte: these are full-colour
	// artwork and that component paints a monochrome mask, which would flatten a
	// flag into one solid block. The label stays next to it, because a flag is a
	// country and not a language.
	const FLAG: Record<Locale, string> = { en: '/icons/usa.svg', es: '/icons/mx.svg' };

	// A link, not a click handler: ?lang= is what pins the language, so the
	// switch produces a URL that behaves the same for whoever receives it.
	//
	// data-sveltekit-reload forces a FULL document navigation rather than a
	// client-side one. The locale is resolved in hooks and the <html lang>
	// attribute is written by transformPageChunk, which only runs on a server
	// render — a client-side navigation would patch the body while leaving the
	// document language (and anything the server computed from it) stale, which
	// is exactly the "I have to reload by hand" symptom.
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
			data-sveltekit-reload
			hreflang={l}
			aria-label={LOCALE_NAME[l]}
			aria-current={on ? 'true' : undefined}
			class="group flex items-center gap-1.5 px-2 py-1 font-mono text-xs tracking-[0.1em] transition-colors {on
				? 'bg-primary-container/15 text-primary-container'
				: 'text-outline hover:text-primary-container'}"
		>
			<img
				src={FLAG[l]}
				alt=""
				aria-hidden="true"
				width="14"
				height="14"
				class="h-3.5 w-3.5 transition-[filter,opacity] duration-200 {on
					? 'opacity-100'
					: 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0'}"
			/>
			{LOCALE_LABEL[l]}
		</a>
	{/each}
</div>
