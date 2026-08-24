<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import type { Credential } from '$lib/types';

	type Node = Credential & { children?: Credential[]; issuerUrl?: string | null };

	let {
		issuer,
		items,
		logo,
		url,
		total
	}: {
		issuer: string;
		items: Node[];
		logo?: string;
		url?: string;
		total?: number;
	} = $props();

	// Rendered as a filesystem listing rather than a flat list: a professional
	// certificate is one credential made of several courses, and a tree shows
	// that relationship where nine identical rows hide it.
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
</script>

<HudPanel class="game-hover p-5">
	<div class="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
		<span class="flex min-w-0 items-center gap-2.5">
			{#if logo}
				<img
					src={logo}
					alt=""
					class="h-8 w-8 shrink-0 border border-white/10 bg-white/5 object-contain p-1"
					loading="lazy"
					decoding="async"
				/>
			{/if}
			{#if url}
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					class="truncate font-mono text-sm font-bold tracking-[0.1em] text-primary-container uppercase hover:underline"
				>
					{issuer}
				</a>
			{:else}
				<span
					class="truncate font-mono text-sm font-bold tracking-[0.1em] text-primary-container uppercase"
				>
					{issuer}
				</span>
			{/if}
		</span>
		<span class="shrink-0 bg-primary-dim px-2 py-0.5 font-mono text-xs font-bold text-surface">
			{String(total ?? items.length).padStart(2, '0')}
		</span>
	</div>

	<!-- terminal listing -->
	<div class="font-mono text-xs leading-relaxed">
		{#each items as node (node.id)}
			{@const hasKids = (node.children?.length ?? 0) > 0}

			{#if hasKids}
				<!-- a specialisation: a directory containing its courses -->
				<div class="mt-1 flex items-baseline gap-2">
					<span class="text-secondary">{slug(node.title)}/</span>
					<span class="ml-auto shrink-0 text-outline">{node.period}</span>
				</div>
				{#each node.children ?? [] as child, i (child.id)}
					{@const last = i === (node.children?.length ?? 0) - 1}
					<div class="flex items-baseline gap-2 pl-1">
						<span class="shrink-0 text-outline">{last ? '└──' : '├──'}</span>
						<span class="min-w-0 break-words text-on-surface-variant">{child.title}</span>
						<span class="ml-auto shrink-0 text-outline">{child.period}</span>
					</div>
				{/each}
			{:else}
				<!-- standalone certificate -->
				<div class="flex items-baseline gap-2">
					<span class="shrink-0 text-outline">-</span>
					<span class="min-w-0 break-words text-on-surface-variant">{node.title}</span>
					<span class="ml-auto shrink-0 text-outline">{node.period}</span>
				</div>
			{/if}
		{/each}

		<!-- the prompt: this is a terminal listing, so it ends at a live prompt -->
		<div class="mt-3 flex items-center gap-1.5 text-primary-container">
			<span class="text-tertiary-container">$</span>
			<span class="inline-block h-3.5 w-[7px] animate-pulse bg-primary-container align-middle"
			></span>
		</div>
	</div>
</HudPanel>
