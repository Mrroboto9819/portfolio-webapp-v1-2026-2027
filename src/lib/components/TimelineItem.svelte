<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import type { Company } from '$lib/types';

	let { job, tag = '', logo }: { job: Company; tag?: string; logo?: string } = $props();

	// The current role gets the live treatment; past roles are quieter, so the
	// eye lands on "where he is now" first.
	const current = $derived(/present|actualidad/i.test(job.period ?? ''));
	const accent = $derived(current ? '#00f3ff' : '#ffabf3');
</script>

<!-- id is the anchor a work project links to, so clicking "at DokitPro"
     scrolls to the job it came from. -->
<div class="relative scroll-mt-24" id="job-{job.id}">
	<!-- rail node -->
	<span
		class="absolute top-9 -left-[41px] hidden h-3 w-3 rotate-45 border md:block"
		style="border-color: {accent}; background: var(--color-surface); box-shadow: 0 0 10px {accent}66"
	></span>

	<HudPanel class="group game-hover hud-corners relative overflow-hidden">
		<!-- accent edge; lights up on hover -->
		<span
			class="absolute inset-y-0 left-0 w-[3px] transition-all duration-300 group-hover:w-[5px]"
			style="background: {accent}; box-shadow: 0 0 12px {accent}66"
		></span>

		<!-- one-pass scan sweep on hover -->
		<span
			class="pointer-events-none absolute inset-x-0 -top-full h-1/2 opacity-0 transition-none group-hover:top-full group-hover:opacity-100"
			style="background: linear-gradient(to bottom, transparent, {accent}18, transparent); transition: top 900ms linear, opacity 200ms"
			aria-hidden="true"
		></span>

		<!-- The identity column is FIXED, not auto: sized by content, a long
		     company name widened it per-card and every card's content started
		     at a different x. The name truncates inside it instead. -->
		<div class="relative grid gap-x-5 gap-y-4 p-5 sm:grid-cols-[7rem_1fr] md:p-7">
			<!-- identity: logo reads as a plate, not a stray favicon -->
			<div class="flex items-center gap-4 sm:block">
				<div
					class="flex h-14 w-14 shrink-0 items-center justify-center border bg-white/[0.06] p-2 transition-all duration-300 md:h-16 md:w-16"
					style="border-color: {accent}55"
				>
					{#if logo}
						<img
							src={logo}
							alt=""
							class="h-full w-full object-contain"
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<span class="font-mono text-lg font-bold" style="color: {accent}">
							{(job.name ?? '?').slice(0, 1)}
						</span>
					{/if}
				</div>
				<span
					class="mt-3 hidden max-w-full truncate font-mono text-xs tracking-[0.1em] uppercase sm:block"
					style="color: {accent}"
					title={job.name}
				>
					{job.name}
				</span>
				<span
					class="min-w-0 truncate font-mono text-sm tracking-[0.1em] uppercase sm:hidden"
					style="color: {accent}"
					title={job.name}
				>
					{job.name}
				</span>
			</div>

			<!-- content -->
			<div class="min-w-0">
				<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
					<div class="min-w-0">
						<div class="mb-1.5 flex flex-wrap items-center gap-2">
							<!-- Badge is optional: blank in the admin means no chip at all,
							     rather than an empty bordered box. -->
							{#if tag?.trim()}
								<span
									class="border px-2 py-0.5 font-mono text-xs tracking-[0.1em] uppercase"
									style="color: {accent}; border-color: {accent}55; background: {accent}12"
								>
									{tag}
								</span>
							{/if}
							{#if current}
								<span
									class="inline-flex items-center gap-1.5 font-mono text-xs text-tertiary-container"
								>
									<span
										class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary-container"
									></span>
									LIVE
								</span>
							{/if}
						</div>
						<h3
							class="m-0 text-lg leading-tight font-bold tracking-[-0.02em] text-on-surface md:text-2xl"
						>
							{job.role}
						</h3>
					</div>

					<span
						class="shrink-0 border border-outline/40 px-2.5 py-1 font-mono text-xs whitespace-nowrap text-on-surface-variant"
					>
						{job.period}
					</span>
				</div>

				<!-- meta row -->
				{#if job.duration || job.employmentType || job.workMode || job.location}
					<div
						class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-mono text-xs text-outline"
					>
						{#if job.duration}<span class="text-on-surface-variant">{job.duration}</span>{/if}
						{#if job.employmentType}<span>· {job.employmentType}</span>{/if}
						{#if job.workMode}
							<span
								class="border border-tertiary-container/40 px-1.5 py-0.5 text-tertiary-container"
							>
								{job.workMode}
							</span>
						{/if}
						{#if job.location}<span class="min-w-0 break-words">· {job.location}</span>{/if}
					</div>
				{/if}

				<!-- measure-capped so lines stay readable on a wide screen -->
				{#if job.description}
					<p class="mt-3.5 mb-0 max-w-[68ch] text-sm leading-relaxed text-on-surface-variant">
						{job.description}
					</p>
				{/if}

				{#if job.tech?.length}
					<div class="rule mt-5 mb-4"></div>
					<ul class="m-0 flex list-none flex-wrap gap-1.5 p-0">
						{#each job.tech as t (t)}
							<li
								class="border border-outline/40 bg-surface-container px-2.5 py-1 font-mono text-xs text-on-surface-variant transition-colors group-hover:border-outline/60"
							>
								{t}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</HudPanel>
</div>
