<script lang="ts">
	import Icon from './Icon.svelte';
	import HudPanel from './HudPanel.svelte';
	import { countUp } from '$lib/motion';

	let {
		label,
		value,
		unit,
		accent,
		icon
	}: { label: string; value: string; unit: string; accent: string; icon?: string } = $props();
</script>

<HudPanel chamfer="corner" class="group game-hover hud-corners relative overflow-hidden p-6">
	<!-- accent wash slides up on hover, per the reference cards -->
	<div
		class="absolute inset-0 translate-y-full transition-transform duration-500 ease-out group-hover:translate-y-0"
		style="background: {accent}; opacity: 0.05"
	></div>

	<div class="relative z-10">
		<div class="mb-4 flex items-start justify-between border-b border-white/5 pb-2">
			<span
				class="font-mono text-xs font-medium tracking-[0.1em] text-on-surface-variant uppercase"
			>
				{label}
			</span>
			{#if icon}
				<span style="color: {accent}; opacity: 0.7"><Icon src={icon} size={20} /></span>
			{/if}
		</div>
		<div
			class="glow text-[32px] leading-tight font-bold tracking-[-0.02em]"
			style="color: {accent}"
		>
			<span use:countUp={value}>{value}</span><span
				class="ml-2.5 font-mono text-sm font-bold text-on-surface-variant"
				style="text-shadow: none">{unit}</span
			>
		</div>
	</div>
</HudPanel>
