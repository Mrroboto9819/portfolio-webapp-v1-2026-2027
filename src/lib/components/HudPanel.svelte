<script lang="ts">
	// Level 1 surface. `accent` paints the 3px cap used to categorise a panel.
	let {
		accent = '',
		chamfer = 'tr',
		class: klass = '',
		children
	}: {
		accent?: string;
		chamfer?: 'tr' | 'corner' | 'none';
		class?: string;
		children: import('svelte').Snippet;
	} = $props();

	const shape = $derived(
		chamfer === 'tr' ? 'chamfer-tr' : chamfer === 'corner' ? 'clip-corner' : ''
	);
</script>

<div class="glass {shape} {klass}">
	{#if accent}
		<div class="h-[3px] w-full" style="background: {accent}"></div>
	{/if}
	{@render children()}
</div>
