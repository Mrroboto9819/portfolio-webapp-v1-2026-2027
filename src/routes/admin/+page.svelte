<script lang="ts">
	import { SCHEMAS } from '$lib/adminSchema';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Admin — Overview</title><meta name="robots" content="noindex" /></svelte:head>

<div class="p-6 md:p-10">
	<h1 class="m-0 mb-8 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">Overview</h1>

	<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
		{#each data.counts as c (c.name)}
			<a href="/admin/{c.name}" class="glass chamfer-tr game-hover block p-5">
				<div class="font-mono text-xs tracking-[0.1em] text-outline uppercase">
					{SCHEMAS[c.name].label}
				</div>
				<div class="mt-2 font-mono text-2xl font-bold text-primary-container">
					{String(c.count).padStart(2, '0')}
				</div>
			</a>
		{/each}
	</div>
</div>
