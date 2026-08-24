<script lang="ts">
	import Offcanvas from './Offcanvas.svelte';
	import LocaleSwitch from './LocaleSwitch.svelte';
	import { ui, DEFAULT_LOCALE, type Locale } from '$lib/i18n';
	import { page } from '$app/state';
	import type { Social, Song } from '$lib/types';

	let {
		social = [],
		locale = DEFAULT_LOCALE,
		songs = []
	}: { social?: Social[]; locale?: Locale; songs?: Song[] } = $props();

	let menuOpen = $state(false);

	// `d` is the row icon in the offcanvas — the reference drawer pairs every
	// label with one. Labels stay professional; only the chrome is cyberpunk.
	// Labels resolve per locale; hrefs never change, so a shared link keeps
	// pointing at the same section regardless of the reader's language.
	// Section anchors only exist on the landing page. From /blog a bare '#work'
	// resolves to /blog#work and goes nowhere, so off the landing they are
	// rewritten to '/#work' — which navigates home and then scrolls.
	const onLanding = $derived(page.url.pathname === '/');
	const sec = (id: string) => (onLanding ? `#${id}` : `/#${id}`);

	const links = $derived([
		{
			label: ui('nav.about', locale),
			href: onLanding ? '#top' : '/',
			d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
		},
		{ label: ui('nav.work', locale), href: sec('work'), d: 'M3 8h18v12H3zM8 8V5h8v3' },
		{
			label: ui('nav.skills', locale),
			href: sec('skills'),
			d: 'M9 3h6v3h3v3h3v6h-3v3h-3v3H9v-3H6v-3H3V9h3V6h3z'
		},
		{ label: ui('nav.projects', locale), href: sec('projects'), d: 'M3 7h6l2 2h10v10H3zM3 7V5h6' },
		{
			label: ui('nav.credentials', locale),
			href: sec('credentials'),
			d: 'M12 3l8 4v5c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V7z'
		},
		{ label: ui('nav.blog', locale), href: '/blog', d: 'M5 3h11l3 3v15H5zM9 8h6M9 12h6M9 16h4' }
	]);
</script>

<nav
	class="fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between border-b border-primary-container/20 bg-surface-lowest/70 px-margin-mobile backdrop-blur-xl md:h-16 md:px-margin-desktop"
>
	<a
		href={onLanding ? '#top' : '/'}
		class="glow-brand glitch-hover font-mono text-sm font-bold tracking-[0.18em] text-primary-container uppercase md:text-lg"
	>
		Pablo Cabrera
	</a>

	<!-- Brand, language, menu. Nothing else: the inline link row collided with
	     the brand on narrow desktops and duplicated the drawer, which is now
	     the single navigation surface at every width. -->
	<div class="flex items-center gap-3">
		<LocaleSwitch current={locale} />

		<!-- burger: every breakpoint, the reference desktop carries one too -->
		<button
			type="button"
			class="group flex h-10 w-10 flex-col items-center justify-center gap-[5px] border border-primary-container/40 text-primary-container transition-colors hover:bg-primary-container/10"
			onclick={() => (menuOpen = true)}
			aria-label="Open menu"
			aria-expanded={menuOpen}
		>
			<span class="block h-px w-5 bg-current transition-all group-hover:w-4"></span>
			<span class="block h-px w-5 bg-current"></span>
			<span class="block h-px w-5 bg-current transition-all group-hover:w-3"></span>
		</button>
	</div>
</nav>

<Offcanvas bind:open={menuOpen} {links} {social} {songs} />
