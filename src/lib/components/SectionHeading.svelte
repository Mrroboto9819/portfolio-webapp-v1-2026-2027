<script lang="ts">
	import { reveal, typewriter } from '$lib/motion';

	let {
		title,
		sub,
		subColor = 'var(--color-secondary)',
		typed = false
	}: { title: string; sub: string; subColor?: string; typed?: boolean } = $props();
</script>

<div class="mb-10" use:reveal={{ y: 18 }}>
	<h2
		class="glitch-hover glow m-0 cursor-default text-2xl font-bold tracking-[-0.02em] text-primary uppercase md:text-[32px]"
	>
		{title}
	</h2>
	{#if typed}
		<div
			class="mt-2 font-mono text-xs font-medium tracking-[0.1em] uppercase"
			style="color: {subColor}"
			use:typewriter
		>
			{sub}
		</div>
	{:else}
		<div
			class="mt-2 font-mono text-xs font-medium tracking-[0.1em] uppercase"
			style="color: {subColor}"
		>
			{sub}
		</div>
	{/if}
</div>
