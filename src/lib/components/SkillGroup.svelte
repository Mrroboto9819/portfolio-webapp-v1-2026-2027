<script lang="ts">
	import Icon from './Icon.svelte';
	import HudPanel from './HudPanel.svelte';
	import { brandColor } from '$lib/brand';
	import type { Skill } from '$lib/types';

	let { name, accent, items }: { name: string; accent: string; items: Skill[] } = $props();
</script>

<HudPanel {accent} class="game-hover">
	<div class="p-6">
		<div class="mb-5 flex items-center justify-between border-b border-white/10 pb-3.5">
			<span class="font-mono text-sm font-bold tracking-[0.1em] uppercase" style="color: {accent}">
				{name}
			</span>
			<span class="font-mono text-xs text-outline">
				{String(items.length).padStart(2, '0')}
			</span>
		</div>

		<ul class="m-0 flex list-none flex-wrap gap-2 p-0">
			{#each items as skill (skill.id)}
				<li
					class="flex items-center gap-2 border border-outline/35 bg-surface-container px-3 py-2 font-mono text-xs text-on-surface transition-colors hover:border-current"
					style="--tw-hover: {accent}"
				>
					{#if skill.icon}
						<Icon src={skill.icon} size={14} color={brandColor(skill.name) ?? accent} />
					{/if}
					{skill.name}
				</li>
			{/each}
		</ul>
	</div>
</HudPanel>
