<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import type { Project } from '$lib/types';

	let { project }: { project: Project } = $props();

	const isMain = $derived(project.type === 'MAIN_QUEST');
	const accent = $derived(isMain ? '#00f3ff' : '#ffabf3');
	// A project is only reachable if `redirect` is an absolute URL; the seed data
	// uses "/" for this very site, which is not a link worth rendering.
	const href = $derived(project.redirect?.startsWith('http') ? project.redirect : null);
</script>

<HudPanel class="game-hover flex h-full flex-col gap-3.5 p-6">
	<div class="flex items-center justify-between">
		<span
			class="border px-2.5 py-1 font-mono text-xs tracking-[0.1em]"
			style="color: {accent}; border-color: {accent}66"
		>
			{project.type ?? 'PROJECT'}
		</span>
		{#if project.completed}
			<span class="font-mono text-xs text-tertiary-container">LIVE</span>
		{/if}
	</div>

	<h3 class="m-0 font-mono text-base font-bold tracking-[0.06em] text-on-surface">
		{project.name}
	</h3>

	<p class="m-0 grow text-sm leading-relaxed text-on-surface-variant">
		{project.description}
	</p>

	{#if project.tech?.length}
		<ul class="flex list-none flex-wrap gap-1.5 p-0">
			{#each project.tech as t (t)}
				<li class="border border-outline/30 px-2 py-1 font-mono text-xs text-outline">{t}</li>
			{/each}
		</ul>
	{/if}

	{#if href}
		<a
			{href}
			target="_blank"
			rel="noopener noreferrer"
			class="mt-1 inline-flex items-center gap-2 font-mono text-xs tracking-[0.1em] uppercase"
			style="color: {accent}"
		>
			OPEN
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M7 17L17 7M9 7h8v8" />
			</svg>
		</a>
	{/if}
</HudPanel>
