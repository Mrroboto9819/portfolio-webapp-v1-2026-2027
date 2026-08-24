<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { brandColor } from '$lib/brand';
	import { gsap } from '$lib/motion';
	import { player } from '$lib/audio.svelte';
	import type { Social, Song } from '$lib/types';

	let {
		open = $bindable(false),
		links,
		social = [],
		songs = []
	}: {
		open?: boolean;
		links: { label: string; href: string; d: string }[];
		social?: Social[];
		songs?: Song[];
	} = $props();

	// Same shared player as the floating widget — one audio element, two
	// surfaces. Mobile has no floating pill, so this is its only transport.
	$effect(() => {
		if (songs.length) player.load(songs);
	});

	let panel: HTMLElement;
	let scrim: HTMLElement;
	let closeBtn: HTMLButtonElement;
	// Empty until the visitor picks a row; the first link is the implicit
	// default. Deriving it keeps the highlight correct if `links` ever changes,
	// which a $state initialiser would not.
	let chosen = $state('');
	const active = $derived(chosen || links[0]?.href || '');
	let previouslyFocused: HTMLElement | null = null;

	const reduced = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Animate on the `open` transition rather than mounting/unmounting, so GSAP
	// always has a stable element and focus can move predictably.
	$effect(() => {
		if (!panel || !scrim) return;

		if (open) {
			previouslyFocused = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';

			if (reduced()) {
				gsap.set(scrim, { autoAlpha: 1 });
				gsap.set(panel, { xPercent: 0, autoAlpha: 1 });
			} else {
				gsap
					.timeline()
					.set(panel, { autoAlpha: 1 })
					.to(scrim, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' }, 0)
					// slides in from the LEFT edge
					.fromTo(panel, { xPercent: -100 }, { xPercent: 0, duration: 0.45, ease: 'power4.out' }, 0)
					.fromTo(
						panel.querySelectorAll('[data-oc-item]'),
						{ opacity: 0, x: -18 },
						{ opacity: 1, x: 0, duration: 0.35, stagger: 0.05, ease: 'power3.out' },
						0.12
					);
			}
			queueMicrotask(() => closeBtn?.focus());
		} else {
			document.body.style.overflow = '';
			if (reduced()) {
				gsap.set(scrim, { autoAlpha: 0 });
				gsap.set(panel, { xPercent: -100, autoAlpha: 0 });
			} else {
				gsap
					.timeline()
					.to(panel, { xPercent: -100, duration: 0.3, ease: 'power3.in' }, 0)
					.to(scrim, { autoAlpha: 0, duration: 0.25 }, 0)
					.set(panel, { autoAlpha: 0 });
			}
			previouslyFocused?.focus();
		}
	});

	onMount(() => () => {
		document.body.style.overflow = '';
	});

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		if (e.key === 'Tab') {
			const focusables = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
			if (!focusables.length) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function go(href: string) {
		chosen = href;
		open = false;
	}

	const email = $derived(social.find((s) => s.name === 'EMAIL')?.url ?? '#credentials');
</script>

<svelte:window on:keydown={onKeydown} />

<!-- scrim: dims the page behind the drawer -->
<div
	bind:this={scrim}
	class="fixed inset-0 z-[60] bg-surface-lowest/85 opacity-0 backdrop-blur-[2px]"
	class:pointer-events-none={!open}
	style="visibility: hidden"
	onclick={() => (open = false)}
	aria-hidden="true"
></div>

<!-- drawer: left edge, full height -->
<div
	bind:this={panel}
	class="glass fixed top-0 left-0 z-[61] flex h-dvh w-[min(80vw,284px)] flex-col opacity-0"
	class:pointer-events-none={!open}
	style="visibility: hidden; border-right: 1px solid rgba(0,220,230,0.35)"
	role="dialog"
	aria-modal="true"
	aria-label="Site navigation"
>
	<!-- identity header -->
	<div data-oc-item class="flex items-center gap-3 border-b border-white/10 px-5 py-4">
		<img
			src="/yo.webp"
			alt=""
			width="40"
			height="40"
			class="h-10 w-10 shrink-0 border border-primary-container/40 object-cover"
			style="box-shadow: 0 0 12px rgba(0,220,230,0.25)"
			loading="lazy"
			decoding="async"
		/>
		<div class="min-w-0 font-mono leading-tight">
			<div class="truncate text-xs font-bold tracking-[0.12em] text-on-surface">PABLO_CABRERA</div>
			<div class="mt-1 text-xs tracking-[0.1em] text-tertiary-container">STATUS: AVAILABLE</div>
		</div>
		<button
			bind:this={closeBtn}
			type="button"
			class="ml-auto flex h-8 w-8 shrink-0 items-center justify-center border border-primary-container/40 text-primary-container transition-colors hover:bg-primary-container/10"
			onclick={() => (open = false)}
			aria-label="Close menu"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M6 6l12 12M18 6L6 18" />
			</svg>
		</button>
	</div>

	<!-- nav rows: icon + label, active row carries a magenta bar and tint -->
	<nav class="flex flex-col py-3">
		{#each links as link (link.href)}
			<a
				href={link.href}
				data-oc-item
				onclick={() => go(link.href)}
				class="group flex items-center gap-3.5 border-l-2 px-5 py-3.5 font-mono text-xs tracking-[0.12em] uppercase transition-colors"
				class:border-secondary-container={active === link.href}
				class:text-secondary-container={active === link.href}
				class:border-transparent={active !== link.href}
				class:text-outline={active !== link.href}
				style={active === link.href ? 'background: rgba(254,0,254,0.10)' : ''}
				aria-current={active === link.href ? 'page' : undefined}
			>
				<svg
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					class="shrink-0"
					aria-hidden="true"
				>
					<path d={link.d} />
				</svg>
				<span class="transition-colors group-hover:text-primary-container">{link.label}</span>
			</a>
		{/each}
	</nav>

	<!-- player transport: the drawer is the only control surface on mobile -->
	{#if songs.length}
		<div data-oc-item class="mt-auto border-t border-white/10 px-5 py-4">
			<div class="mb-2.5 flex items-center justify-between">
				<span class="font-mono text-xs tracking-[0.14em] text-secondary uppercase">// AUDIO</span>
				<span class="flex h-3 items-end gap-[2px]" aria-hidden="true">
					{#each [0, 1, 2, 3] as b (b)}
						<span
							class="w-[2px] bg-primary-container"
							style="height: {player.playing ? 100 : 25}%; {player.playing
								? `animation: oc-eq 900ms ${b * 120}ms ease-in-out infinite alternate`
								: ''}"
						></span>
					{/each}
				</span>
			</div>

			<div class="mb-3 truncate font-mono text-xs text-on-surface">
				{player.current?.title ?? '—'}
				{#if player.current?.artist}
					<span class="text-outline">· {player.current.artist}</span>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => player.prev()}
					aria-label="Previous track"
					class="border border-outline/40 p-2 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path d="M6 5h2v14H6zm3 7l9-7v14z" /></svg
					>
				</button>
				<button
					type="button"
					onclick={() => player.toggle()}
					aria-label={player.playing ? 'Pause' : 'Play'}
					class="flex-1 border border-primary-container/60 bg-primary-container/10 py-2 font-mono text-xs tracking-[0.12em] text-primary-container uppercase hover:bg-primary-container/20"
				>
					{player.playing ? 'Pause' : 'Play'}
				</button>
				<button
					type="button"
					onclick={() => player.next()}
					aria-label="Next track"
					class="border border-outline/40 p-2 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path d="M16 5h2v14h-2zM6 5l9 7-9 7z" /></svg
					>
				</button>
			</div>
		</div>
	{/if}

	<!-- footer: social + primary action -->
	<div class="{songs.length ? '' : 'mt-auto'} border-t border-white/10 px-5 py-4">
		{#if social.length}
			<div data-oc-item class="mb-4 flex flex-wrap gap-4">
				{#each social as s (s.id)}
					<a
						href={s.url}
						target={s.url.startsWith('http') ? '_blank' : null}
						rel="noopener noreferrer"
						class="flex items-center gap-2 font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase transition-colors hover:text-primary-container"
					>
						{#if s.icon}<Icon src={s.icon} size={14} color={brandColor(s.name)} />{/if}
						{s.name}
					</a>
				{/each}
			</div>
		{/if}

		<a
			data-oc-item
			href={email}
			class="block border border-secondary-container/60 py-3 text-center font-mono text-xs tracking-[0.14em] text-secondary uppercase transition-colors hover:bg-secondary-container/10"
			onclick={() => (open = false)}
		>
			Get In Touch
		</a>
	</div>
</div>

<style>
	@keyframes oc-eq {
		from {
			height: 25%;
		}
		to {
			height: 100%;
		}
	}
</style>
