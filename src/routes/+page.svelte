<script lang="ts">
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import MetricCard from '$lib/components/MetricCard.svelte';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import TimelineItem from '$lib/components/TimelineItem.svelte';
	import SkillGroup from '$lib/components/SkillGroup.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import CredentialGroup from '$lib/components/CredentialGroup.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import AdminShortcut from '$lib/components/AdminShortcut.svelte';
	import MusicPlayer from '$lib/components/MusicPlayer.svelte';
	import { reveal, revealStagger } from '$lib/motion';
	import { ui } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const ACCENTS = ['#00f3ff', '#ffabf3', '#a1f21d'];

	// Look a section up by key so a block can read its admin-set heading.
	// Returns null when the admin has hidden or removed the section, which is
	// how a block disappears from the page.
	const sectionFor = (key: string) => data.sections.find((s) => s.key === key) ?? null;

	// Stored stats first, then the derived experience metric so the row reads
	// as three across — see CAREER_START in +page.server.ts.
	const metrics = $derived([
		...data.stats.map((s, i) => ({
			label: s.label,
			value: s.value,
			unit: s.label === 'PROJECTS' ? 'SYS' : 'CUP',
			icon: s.icon,
			accent: ACCENTS[i % ACCENTS.length]
		})),
		{
			label: 'EXPERIENCE_CYCLE',
			value: String(data.experienceYears).padStart(2, '0'),
			unit: 'YRS',
			icon: undefined,
			accent: ACCENTS[2]
		}
	]);
</script>

<svelte:head>
	<title>Pablo Cabrera — Full Stack Engineer</title>
	<meta
		name="description"
		content="Pablo Cabrera — fullstack engineer. Vue, React, Django, Node. Portfolio, experience and projects."
	/>
	<meta property="og:title" content="Pablo Cabrera — Full Stack Engineer" />
	<meta
		property="og:description"
		content="Fullstack engineer building web platforms end to end — Vue, React, Django, Node."
	/>
	<meta property="og:type" content="website" />
</svelte:head>

<AdminShortcut />
<div class="crt" aria-hidden="true"></div>
<Atmosphere />
<Nav social={data.social} locale={data.locale} songs={data.songs} />

<main
	id="top"
	class="relative z-10 mx-auto min-h-screen max-w-(--container-max) px-margin-mobile pt-20 pb-16 md:px-margin-desktop md:pt-24 md:pb-20"
>
	<Hero profile={data.profile} social={data.social} locale={data.locale} />

	<!-- ================= METRICS ================= -->
	<!-- Sections render in the order `sections` returns them, with the admin's
	     own headings. `key` picks the block; everything else is data. -->
	<section
		class="mt-14 grid grid-cols-1 gap-gutter sm:grid-cols-2 md:mt-16 md:grid-cols-3"
		use:revealStagger={{ each: 0.1 }}
	>
		{#each metrics as m (m.label)}
			<MetricCard label={m.label} value={m.value} unit={m.unit} accent={m.accent} icon={m.icon} />
		{/each}
	</section>

	<!-- ================= WORK ================= -->
	{#if sectionFor('work')}
		{@const sec = sectionFor('work')!}
		<section id="work" class="mt-20 scroll-mt-24 md:mt-24">
			<SectionHeading title={sec.label} sub={sec.sub ?? ''} />

			<div class="md:flex md:gap-8">
				<!-- rail: the active segment glows -->
				<div class="relative ml-2 hidden w-px shrink-0 bg-white/10 md:block">
					<div
						class="absolute top-0 left-0 h-56 w-px bg-primary-dim"
						style="box-shadow: 0 0 10px rgba(0,220,230,0.6)"
					></div>
				</div>

				<div class="flex grow flex-col gap-6" use:revealStagger={{ each: 0.12 }}>
					{#each data.companies as job (job.id)}
						<TimelineItem {job} tag={job.seniority ?? ''} logo={job.logo} />
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- ================= SKILLS ================= -->
	{#if sectionFor('skills')}
		{@const sec = sectionFor('skills')!}
		<section id="skills" class="mt-20 scroll-mt-24 md:mt-24">
			<SectionHeading
				title={sec.label}
				sub={sec.sub ?? ''}
				typed
				subColor="var(--color-on-surface-variant)"
			/>
			<div class="grid grid-cols-1 gap-gutter md:grid-cols-3" use:revealStagger>
				{#each data.skillGroups as g (g.name)}
					<SkillGroup name={g.name} accent={g.accent} items={g.items} />
				{/each}
			</div>
		</section>
	{/if}

	<!-- ================= PROJECTS ================= -->
	{#if sectionFor('projects')}
		{@const sec = sectionFor('projects')!}
		<section id="projects" class="mt-20 scroll-mt-24 md:mt-24">
			<SectionHeading title={sec.label} sub={sec.sub ?? ''} />
			{#if data.projects.length}
				<div class="grid grid-cols-1 gap-gutter md:grid-cols-3" use:revealStagger>
					{#each data.projects as p (p.id)}
						<ProjectCard project={p} locale={data.locale} />
					{/each}
				</div>
			{:else}
				<HudPanel class="p-8">
					<p class="m-0 font-mono text-sm text-on-surface-variant">
						No active projects. Set <code class="text-primary-container">isActive: true</code> on a project
						to surface it here.
					</p>
				</HudPanel>
			{/if}
		</section>
	{/if}

	<!-- ================= CREDENTIALS ================= -->
	<section id="credentials" class="mt-20 scroll-mt-24 md:mt-24">
		<SectionHeading
			title="Credentials"
			sub="{data.credentialCount} verified records"
			subColor="var(--color-tertiary-container)"
		/>

		<div use:reveal>
			{#if data.filters.trackOptions.length > 1 || data.filters.issuerOptions.length > 1}
				<div id="track" class="scroll-mt-24">
					{#if data.filters.trackOptions.length > 1}
						<FilterBar
							param="cert_track"
							label={ui('filter.discipline', data.locale)}
							locale={data.locale}
							active={data.filters.track}
							options={data.filters.trackOptions}
						/>
					{/if}
					{#if data.filters.issuerOptions.length > 1}
						<FilterBar
							param="cert_issuer"
							label={ui('filter.issuer', data.locale)}
							locale={data.locale}
							active={data.filters.issuer}
							options={data.filters.issuerOptions}
						/>
					{/if}
				</div>

				{#if data.filters.active}
					<p class="mb-6 font-mono text-xs text-on-surface-variant">
						{ui('filter.showing', data.locale)}
						<span class="text-primary-container">{data.credentialCount}</span>
						{ui('filter.of', data.locale)}
						{data.filters.totalCredentials} —
						<a
							href="?lang={data.locale}"
							data-sveltekit-noscroll
							class="text-secondary underline underline-offset-4"
							>{ui('filter.clear', data.locale)}</a
						>
					</p>
				{/if}
			{/if}

			{#each data.degrees as d (d.id)}
				<HudPanel class="game-hover mb-4 p-6 md:p-7">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="flex items-start gap-4 md:gap-5">
							{#if d.image}
								<!-- Institution mark, in its own colours. Square tile because the
								     asset is a full-bleed brand tile, not a transparent glyph. -->
								<img
									src={d.image}
									alt="{d.institution} logo"
									width="64"
									height="64"
									class="h-14 w-14 shrink-0 border border-white/10 object-cover md:h-16 md:w-16"
									loading="lazy"
									decoding="async"
								/>
							{/if}
							<div>
								<span
									class="border border-tertiary-container/30 bg-tertiary-container/10 px-2.5 py-1 font-mono text-xs tracking-[0.1em] text-tertiary-container"
								>
									DEGREE
								</span>
								<h3 class="mt-3.5 mb-1.5 text-lg font-bold text-on-surface md:text-xl">
									{d.title}
								</h3>
								<div class="font-mono text-xs tracking-[0.06em] text-on-surface-variant uppercase">
									{#if d.url}
										<a
											href={d.url}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1.5 text-tertiary-container underline decoration-tertiary-container/40 underline-offset-4 transition-colors hover:decoration-tertiary-container"
										>
											{d.institution}
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.5"
												aria-hidden="true"
											>
												<path d="M7 17L17 7M9 7h8v8" />
											</svg>
										</a>
									{:else}
										{d.institution}
									{/if}{#if d.field}
										&middot; {d.field}{/if}
								</div>
							</div>
						</div>
						<span
							class="border border-outline/40 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-on-surface-variant"
						>
							{d.period}
						</span>
					</div>
				</HudPanel>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-gutter md:grid-cols-3" use:revealStagger>
			{#each data.credentialGroups as g (g.issuer)}
				<CredentialGroup
					issuer={g.issuer}
					items={g.items}
					logo={g.logo}
					url={g.url}
					total={g.total}
				/>
			{/each}
		</div>
	</section>
</main>

<MusicPlayer songs={data.songs} />

<Footer />
