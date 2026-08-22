<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { brandColor } from '$lib/brand';
	import { heroIntro } from '$lib/motion';
	import type { Social } from '$lib/types';

	let { social }: { social: Social[] } = $props();

	let root: HTMLElement;

	onMount(() => {
		const tl = heroIntro(root);
		return () => tl?.kill();
	});

	const readout = [
		{ k: 'OPERATOR', v: 'PABLO_CABRERA', accent: false },
		{ k: 'ROLE', v: 'FULLSTACK_ENGINEER', accent: false },
		{ k: 'LOCATION', v: 'MEXICO', accent: false }
	];
	const stack = [
		{ k: 'FRONTEND', v: 'VUE / REACT / NUXT' },
		{ k: 'BACKEND', v: 'DJANGO / NODE / FLASK' },
		{ k: 'DATA', v: 'MONGODB / MYSQL' },
		{ k: 'INFRA', v: 'DOCKER / K3S' }
	];
</script>

<div bind:this={root} class="grid grid-cols-4 gap-gutter md:grid-cols-12">
	<!-- ---- copy ---- -->
	<div class="col-span-4 flex flex-col justify-center md:col-span-7 md:min-h-[460px]">
		<div
			data-hero="status"
			class="mb-6 flex items-center gap-3 font-mono text-xs font-medium tracking-[0.1em] uppercase"
		>
			<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-container"></span>
			<span class="text-secondary">&gt;&gt; STATUS: AVAILABLE</span>
			<span class="hidden h-px grow bg-secondary/30 sm:block"></span>
			<span class="text-on-surface-variant/70">v4.0.0</span>
		</div>

		<h1
			data-hero="title"
			class="glitch-hover glow-hero m-0 mb-6 cursor-default text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] text-primary uppercase md:text-5xl"
		>
			Full Stack<br />Engineer
		</h1>

		<p data-hero="copy" class="m-0 mb-8 max-w-xl text-base leading-relaxed text-on-surface-variant">
			I build web platforms end to end — Vue and React on the front, Django and Node behind them,
			shipped on Docker. Currently fullstack at DOKITPRO, previously ALLUXI and I20VEINTE.
		</p>

		<div data-hero="cta" class="flex flex-wrap gap-4">
			<a
				href="#projects"
				class="clip-corner bg-primary-container px-7 py-3.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase transition-colors hover:bg-primary-fixed"
			>
				View Projects
			</a>
			{#if social.length}
				<a
					href={social.find((s) => s.name === 'EMAIL')?.url ?? '#credentials'}
					class="clip-corner border border-primary-container px-7 py-3.5 font-mono text-xs tracking-[0.1em] text-primary-container uppercase transition-colors hover:bg-primary-container/10"
				>
					Get In Touch
				</a>
			{/if}
		</div>

		{#if social.length}
			<div data-hero="social" class="mt-8 flex flex-wrap gap-5">
				{#each social as s (s.id)}
					<a
						href={s.url}
						target={s.url.startsWith('http') ? '_blank' : null}
						rel="noopener noreferrer"
						class="flex items-center gap-2 font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase transition-colors hover:text-primary-container"
					>
						{#if s.icon}<Icon src={s.icon} size={16} color={brandColor(s.name)} />{/if}
						{s.name}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ---- SYS_READOUT panel ---- -->
	<div class="col-span-4 flex items-start justify-end pt-4 md:col-span-5 md:pt-6">
		<div
			data-hero="panel"
			class="glass clip-corner game-hover w-full p-1"
			style="box-shadow: 0 0 20px rgba(0,220,230,0.1)"
		>
			<div class="hud-border hud-corners relative overflow-hidden p-5">
				<div class="mb-5 flex items-center gap-2.5">
					<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-container"
					></span>
					<span class="font-mono text-xs font-medium tracking-[0.1em] text-secondary">
						SYS_READOUT
					</span>
				</div>

				<div class="mb-5 flex items-center gap-4">
					<img
						src="/yo.webp"
						alt="Pablo Cabrera"
						width="64"
						height="64"
						class="h-16 w-16 border border-primary-container/40 object-cover"
						style="box-shadow: 0 0 14px rgba(0,220,230,0.25)"
						loading="eager"
						decoding="async"
					/>
					<div class="font-mono text-xs leading-relaxed">
						<div class="text-on-surface">PABLO_CABRERA</div>
						<div class="text-tertiary-container">STATUS: SYNCED</div>
					</div>
				</div>

				<div class="flex flex-col gap-3 font-mono text-xs leading-relaxed">
					{#each readout as row (row.k)}
						<div data-hero="row" class="flex justify-between gap-4">
							<span class="text-outline">{row.k}</span>
							<span class="text-on-surface">{row.v}</span>
						</div>
					{/each}
					<div class="rule my-1"></div>
					{#each stack as row (row.k)}
						<div data-hero="row" class="flex justify-between gap-4">
							<span class="text-outline">{row.k}</span>
							<span class="text-right text-primary-container">{row.v}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
