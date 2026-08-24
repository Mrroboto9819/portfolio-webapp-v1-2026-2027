<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { brandColor } from '$lib/brand';
	import { heroIntro } from '$lib/motion';
	import type { Profile, Social } from '$lib/types';

	let { profile, social }: { profile: Profile; social: Social[] } = $props();

	let root: HTMLElement;

	onMount(() => {
		const tl = heroIntro(root);
		return () => tl?.kill();
	});

	// The readout is whatever the admin put in profile.metadata — Stripe-style
	// key/value rows, rendered in stored order. No hardcoded stack list.
	const rows = $derived(profile.metadata ?? []);
	const emailHref = $derived(social.find((s) => s.name === 'EMAIL')?.url ?? '#credentials');
	// Headline may carry a line break as a literal "\n" from the editor.
	const headlineLines = $derived((profile.headline ?? '').split(/\r?\n/).filter(Boolean));
</script>

<div bind:this={root} class="grid grid-cols-4 gap-gutter md:grid-cols-12">
	<!-- ---- copy ---- -->
	<div class="col-span-4 flex flex-col justify-center md:col-span-7 md:min-h-[460px]">
		<div
			data-hero="status"
			class="mb-6 flex items-center gap-3 font-mono text-xs font-medium tracking-[0.1em] uppercase"
		>
			<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-container"></span>
			<span class="text-secondary">&gt;&gt; STATUS: {profile.statusLabel ?? 'AVAILABLE'}</span>
			<span class="hidden h-px grow bg-secondary/30 sm:block"></span>
			<span class="text-on-surface-variant/70">{profile.version ?? ''}</span>
		</div>

		<h1
			data-hero="title"
			class="glitch-hover glow-hero m-0 mb-6 cursor-default text-[32px] leading-[1.1] font-extrabold tracking-[-0.04em] text-primary uppercase md:text-5xl"
		>
			{#each headlineLines as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
		</h1>

		<p data-hero="copy" class="m-0 mb-8 max-w-xl text-base leading-relaxed text-on-surface-variant">
			{profile.bio}
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
						src={profile.avatar ?? '/yo.webp'}
						alt={profile.displayName}
						width="64"
						height="64"
						class="h-16 w-16 border border-primary-container/40 object-cover"
						style="box-shadow: 0 0 14px rgba(0,220,230,0.25)"
						loading="eager"
						decoding="async"
					/>
					<div class="min-w-0 font-mono text-xs leading-relaxed">
						<div class="truncate text-on-surface">{profile.displayName}</div>
						<div class="text-tertiary-container">STATUS: {profile.statusLabel ?? 'SYNCED'}</div>
					</div>
				</div>

				{#if rows.length}
					<div class="flex flex-col gap-3 font-mono text-xs leading-relaxed">
						{#each rows as row (row.key)}
							<div data-hero="row" class="flex justify-between gap-4">
								<span class="shrink-0 text-outline">{row.key}</span>
								<span
									class="min-w-0 text-right break-words"
									style="color: {row.accent ?? 'var(--color-on-surface)'}"
								>
									{row.value}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
