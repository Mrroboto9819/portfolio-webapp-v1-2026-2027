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

	// ---- auto-hide on scroll -------------------------------------------------
	//
	// The bar holds its place for the first screenful, then gets out of the way
	// while the reader moves DOWN the page and returns the moment they scroll
	// UP — the direction they move when they are looking for navigation.
	//
	// It never vanishes completely: the bar collapses into the hairline rail it
	// was already drawing as its bottom border, so the top of the viewport keeps
	// its edge and the return reads as the rail expanding rather than as a panel
	// appearing out of nowhere.

	/** How far down before hiding is allowed at all — roughly the hero. */
	const ENGAGE_AT = 96;
	/** Ignore movement smaller than this: trackpads and iOS rubber-banding emit
	 *  a constant dribble of 1–2px events, and reacting to those makes the bar
	 *  flicker on a page that is not really moving. */
	const DEADZONE = 8;

	let hidden = $state(false);
	let atTop = $state(true);
	/** Bumped on every reveal, purely to re-key the sweep so it replays. */
	let reveals = $state(0);
	let lastY = 0;

	function onScroll() {
		const y = window.scrollY;
		const delta = y - lastY;
		if (Math.abs(delta) < DEADZONE) return;

		atTop = y < ENGAGE_AT;

		// An open drawer pins the bar: hiding the control that opened it while
		// it is open leaves the close button floating with nothing behind it.
		const next = !menuOpen && !atTop && delta > 0;
		if (hidden && !next) reveals += 1;
		hidden = next;

		lastY = y;
	}

	// Opening the drawer must bring the bar back immediately rather than
	// waiting for the next scroll event — the burger that opened it lives here.
	$effect(() => {
		if (menuOpen && hidden) {
			reveals += 1;
			hidden = false;
		}
	});

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

<svelte:window onscroll={onScroll} />

<!-- The rail the bar collapses into. Fixed and independent of the bar, so it
     stays put while the bar travels over it. -->
<div class="nav-rail" class:lit={hidden} aria-hidden="true"></div>

<nav
	class="nav-bar fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between border-b border-primary-container/20 bg-surface-lowest/70 px-margin-mobile backdrop-blur-xl md:h-16 md:px-margin-desktop"
	class:is-hidden={hidden}
	class:is-floating={!atTop && !hidden}
>
	<!-- Re-keyed on each reveal so the sweep replays: a CSS animation only
	     restarts when the element is new or the animation-name changes. -->
	{#key reveals}
		{#if reveals > 0 && !hidden}
			<span class="nav-sweep" aria-hidden="true"></span>
		{/if}
	{/key}

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

<style>
	.nav-bar {
		/* translate3d, not top/height: it stays on the compositor, so the bar
		   does not force a layout pass on a page that is already scrolling. */
		transform: translate3d(0, 0, 0);
		transition:
			transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 260ms ease,
			box-shadow 420ms ease;
		will-change: transform;
	}

	/* Retracting: a touch faster than the return, and it leaves along a slight
	   scale so it reads as folding into the rail rather than sliding off. */
	.nav-bar.is-hidden {
		transform: translate3d(0, -100%, 0) scaleY(0.94);
		transform-origin: top center;
		opacity: 0;
		transition-duration: 260ms, 160ms, 260ms;
		pointer-events: none;
	}

	/* Away from the top the bar is over content rather than over the hero, so
	   it earns a little more separation from what is passing underneath. */
	.nav-bar.is-floating {
		box-shadow:
			0 1px 0 0 rgb(0 220 230 / 0.18),
			0 10px 30px -18px rgb(0 0 0 / 0.9);
	}

	.nav-rail {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 49;
		height: 1px;
		width: 100%;
		background: linear-gradient(
			90deg,
			transparent,
			var(--color-primary-container, #00f3ff) 12%,
			var(--color-primary-container, #00f3ff) 88%,
			transparent
		);
		opacity: 0;
		/* Drawn from the centre out, so the bar leaving and the rail arriving
		   are one motion instead of two. */
		transform: scaleX(0.2);
		transform-origin: center;
		transition:
			opacity 260ms ease,
			transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: none;
	}

	.nav-rail.lit {
		opacity: 0.55;
		transform: scaleX(1);
	}

	/* The reveal sweep: one pass of light across the bar, once, on return. */
	.nav-sweep {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			100deg,
			transparent 40%,
			rgb(0 243 255 / 0.14) 50%,
			transparent 60%
		);
		background-size: 250% 100%;
		animation: nav-sweep 620ms cubic-bezier(0.4, 0, 0.2, 1) 1;
	}

	@keyframes nav-sweep {
		from {
			background-position: 180% 0;
		}
		to {
			background-position: -80% 0;
		}
	}

	/* Effects off, or reduced motion: the bar still gets out of the way, it
	   just does it instantly and without the light. */
	:global(.no-fx) .nav-bar,
	:global(.no-fx) .nav-rail {
		transition: none;
	}
	:global(.no-fx) .nav-sweep {
		display: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-bar,
		.nav-rail {
			transition-duration: 1ms;
		}
		.nav-sweep {
			display: none;
		}
	}
</style>
