<script lang="ts">
	import HudPanel from './HudPanel.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import type { Project } from '$lib/types';

	let { project, locale = 'en' }: { project: Project & { companyName?: string }; locale?: Locale } =
		$props();

	const isWork = $derived(project.context === 'work');
	const accent = $derived(isWork ? '#ffabf3' : '#00f3ff');

	// The three link cases, resolved once. A private repo offers its release
	// download instead of a 404 on GitHub; a project with none of them still
	// renders as a normal card rather than an empty row of buttons.
	const links = $derived(
		[
			project.liveUrl
				? { href: project.liveUrl, label: ui('project.open', locale), primary: true }
				: null,
			project.repoUrl && !project.repoPrivate
				? { href: project.repoUrl, label: ui('project.code', locale), primary: false }
				: null,
			project.repoPrivate && project.releaseUrl
				? { href: project.releaseUrl, label: ui('project.download', locale), primary: false }
				: null
		].filter((l): l is { href: string; label: string; primary: boolean } => l !== null)
	);
</script>

<HudPanel class="game-hover flex h-full flex-col gap-3.5 p-6">
	<div class="flex flex-wrap items-center justify-between gap-2">
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

	<div>
		<h3 class="m-0 font-mono text-base font-bold tracking-[0.06em] text-on-surface">
			{project.name}
		</h3>
		{#if isWork && project.companyName}
			<div class="mt-1 font-mono text-xs text-outline">
				at <span class="text-secondary">{project.companyName}</span>
			</div>
		{/if}
	</div>

	<p class="m-0 grow text-sm leading-relaxed text-on-surface-variant">{project.description}</p>

	{#if project.tech?.length}
		<ul class="flex list-none flex-wrap gap-1.5 p-0">
			{#each project.tech as t (t)}
				<li class="border border-outline/30 px-2 py-1 font-mono text-xs text-outline">{t}</li>
			{/each}
		</ul>
	{/if}

	{#if links.length}
		<div class="mt-1 flex flex-wrap gap-2">
			{#each links as l (l.href)}
				<a
					href={l.href}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors"
					style={l.primary
						? `color: ${accent}; border-color: ${accent}66`
						: 'color: var(--color-outline); border-color: rgba(132,148,149,0.35)'}
				>
					{l.label}
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"
					>
						<path d="M7 17L17 7M9 7h8v8" />
					</svg>
				</a>
			{/each}
		</div>
	{:else if project.repoPrivate}
		<!-- Honest about why there is nothing to click. -->
		<span class="mt-1 font-mono text-xs text-outline">{ui('project.private', locale)}</span>
	{/if}
</HudPanel>
