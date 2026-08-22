<script lang="ts">
	import Offcanvas from './Offcanvas.svelte';
	import type { Social } from '$lib/types';

	let { social = [] }: { social?: Social[] } = $props();

	let menuOpen = $state(false);

	// `d` is the row icon in the offcanvas — the reference drawer pairs every
	// label with one. Labels stay professional; only the chrome is cyberpunk.
	const links = [
		{ label: 'ABOUT', href: '#top', d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
		{ label: 'WORK', href: '#work', d: 'M3 8h18v12H3zM8 8V5h8v3' },
		{ label: 'SKILLS', href: '#skills', d: 'M9 3h6v3h3v3h3v6h-3v3h-3v3H9v-3H6v-3H3V9h3V6h3z' },
		{ label: 'PROJECTS', href: '#projects', d: 'M3 7h6l2 2h10v10H3zM3 7V5h6' },
		{
			label: 'CREDENTIALS',
			href: '#credentials',
			d: 'M12 3l8 4v5c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V7z'
		}
	];
</script>

<nav
	class="fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between border-b border-primary-container/20 bg-surface-lowest/70 px-margin-mobile backdrop-blur-xl md:h-16 md:px-margin-desktop"
>
	<a
		href="#top"
		class="glow-brand glitch-hover font-mono text-sm font-bold tracking-[0.18em] text-primary-container uppercase md:text-lg"
	>
		Pablo Cabrera
	</a>

	<!-- inline links: desktop only -->
	<div
		class="hidden items-center gap-8 font-mono text-sm font-bold tracking-[0.1em] uppercase lg:flex"
	>
		{#each links.slice(0, 5) as link (link.href)}
			<a
				href={link.href}
				class="px-2 py-1 text-on-surface-variant/70 transition-colors hover:bg-primary-container/5 hover:text-primary-container"
			>
				{link.label}
			</a>
		{/each}
	</div>

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
</nav>

<Offcanvas bind:open={menuOpen} {links} {social} />
