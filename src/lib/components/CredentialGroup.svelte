<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import type { Credential } from '$lib/types';

	let { issuer, items, logo }: { issuer: string; items: Credential[]; logo?: string } = $props();
</script>

<HudPanel class="game-hover p-5">
	<div class="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
		<span class="flex items-center gap-2.5">
			{#if logo}
				<img src={logo} alt="" class="h-8 w-8 shrink-0 border border-white/10 bg-white/5 object-contain p-1" loading="lazy" decoding="async" />
			{/if}
			<span class="font-mono text-sm font-bold tracking-[0.1em] text-primary-container uppercase">
				{issuer}
			</span>
		</span>
		<span class="bg-primary-dim px-2 py-0.5 font-mono text-xs font-bold text-surface">
			{String(items.length).padStart(2, '0')}
		</span>
	</div>

	<ul class="m-0 flex list-none flex-col gap-2.5 p-0">
		{#each items as c (c.id)}
			<li class="text-sm leading-snug text-on-surface-variant">
				{c.title}
				<span class="ml-1 font-mono text-xs text-outline">{c.period}</span>
			</li>
		{/each}
	</ul>
</HudPanel>
