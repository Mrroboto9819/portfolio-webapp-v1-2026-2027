<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import type { Company } from '$lib/types';

	// `tag` is null for every role except the current one — the badge and its
	// gap are dropped entirely rather than rendered empty.
	let { job, tag, logo }: { job: Company; tag?: string | null; logo?: string } = $props();
</script>

<div class="relative">
	<!-- diamond node on the rail -->
	<span
		class="absolute top-8 -left-[41px] hidden h-3 w-3 rotate-45 border border-primary-dim bg-surface md:block"
	></span>

	<HudPanel class="game-hover p-6 md:p-7">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex items-center gap-4">
				{#if tag}
					<span
						class="border border-secondary/30 bg-secondary/10 px-2.5 py-1 font-mono text-xs tracking-[0.1em] text-secondary uppercase"
						style="box-shadow: 0 0 4px rgba(255,171,243,0.3)"
					>
						{tag}
					</span>
				{/if}
				<h3 class="m-0 text-lg font-bold tracking-[-0.02em] text-on-surface md:text-2xl">
					{job.role}
				</h3>
			</div>
			<span
				class="border border-outline/40 px-3 py-1.5 font-mono text-xs tracking-[0.1em] whitespace-nowrap text-on-surface-variant"
			>
				{job.period}
			</span>
		</div>

		{#if job.employmentType || job.workMode || job.location || job.duration}
			<div
				class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-xs text-outline"
			>
				{#if job.duration}<span>{job.duration}</span>{/if}
				{#if job.employmentType}<span class="text-on-surface-variant">{job.employmentType}</span
					>{/if}
				{#if job.workMode}
					<span class="border border-tertiary-container/40 px-2 py-0.5 text-tertiary-container">
						{job.workMode}
					</span>
				{/if}
				{#if job.location}<span>{job.location}</span>{/if}
			</div>
		{/if}

		{#if job.description}
			<p class="mt-3 mb-0 text-sm leading-relaxed text-on-surface-variant">{job.description}</p>
		{/if}

		<div class="mt-3 flex items-center gap-2.5">
			{#if logo}
				<img
					src={logo}
					alt=""
					class="h-9 w-9 shrink-0 border border-white/10 bg-white/5 object-contain p-1 md:h-10 md:w-10"
					loading="lazy"
					decoding="async"
				/>
			{/if}
			<span class="font-mono text-xs tracking-[0.1em] text-primary-container uppercase">
				{job.name}
			</span>
		</div>

		{#if job.tech?.length}
			<div class="rule my-5"></div>
			<ul class="flex list-none flex-wrap gap-2 p-0">
				{#each job.tech as t (t)}
					<li
						class="border border-outline/40 px-2.5 py-1.5 font-mono text-xs text-on-surface-variant"
					>
						{t}
					</li>
				{/each}
			</ul>
		{/if}
	</HudPanel>
</div>
