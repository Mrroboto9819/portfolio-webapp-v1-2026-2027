<script lang="ts">
	import Icon from './Icon.svelte';
	import PixelIcon from './PixelIcon.svelte';
	import { brandColor } from '$lib/brand';
	import { content } from '$lib/content.svelte';
	import { ui } from '$lib/i18n';

	// The locale comes from the shared content store rather than a prop: the
	// footer is rendered by three different routes and none of them should have
	// to remember to thread it down.
	const locale = $derived(content.locale);

	// What actually runs this site, in the order a request meets it. Each entry
	// names a mark in static/icons/ and, where the mark has an official brand
	// colour, $lib/brand.ts supplies it — same treatment as the skills grid, so
	// the footer does not invent a second visual language for the same logos.
	const STACK = [
		{ label: 'SvelteKit', brand: 'SVELTE', src: '/icons/svelte.svg' },
		{ label: 'TypeScript', brand: 'TYPESCRIPT', src: '/icons/typescript.svg' },
		{ label: 'Node', brand: 'NODE.JS', src: '/icons/nodedotjs.svg' },
		{ label: 'MongoDB', brand: 'MONGODB', src: '/icons/mongodb.svg' },
		{ label: 'Docker', brand: 'DOCKER', src: '/icons/docker.svg' },
		{ label: 'k3s', brand: 'K3S', src: '/icons/k3s.svg' },
		{ label: 'GitHub Actions', brand: 'GITHUB ACTIONS', src: '/icons/githubactions.svg' },
		{ label: 'Linux', brand: 'LINUX', src: '/icons/linux.svg' }
	];
</script>

<footer class="relative z-10 border-t border-white/10 bg-surface-lowest/60">
	<div
		class="mx-auto flex max-w-(--container-max) flex-col gap-3 px-margin-mobile py-5 md:flex-row md:items-center md:justify-between md:px-margin-desktop"
	>
		<span class="font-mono text-xs tracking-[0.06em] text-outline"> &copy;2026 PABLO CABRERA </span>
		<div
			class="flex flex-wrap gap-5 font-mono text-xs tracking-[0.06em] text-tertiary-container italic md:gap-7"
		>
			<span>LATENCY: 12ms</span>
			<span>UPTIME: 99.9%</span>
			<span>SIG_STRENGTH: MAX</span>
		</div>
	</div>

	<!-- colophon -->
	<div class="border-t border-white/5">
		<div
			class="mx-auto flex max-w-(--container-max) flex-col gap-4 px-margin-mobile py-5 md:flex-row md:items-center md:justify-between md:px-margin-desktop"
		>
			<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
				<span class="font-mono text-xs tracking-[0.06em] text-outline">
					{ui('footer.madeBy', locale)}
				</span>
				<!-- The heart beats on hover: same 7x7 grid, two masks. -->
				<PixelIcon
					icon="heart"
					hover="heart-beat"
					size={14}
					color="#fe00fe"
					label={ui('footer.love', locale)}
				/>
				<span class="font-mono text-xs tracking-[0.06em] text-outline">
					{ui('footer.and', locale)}
				</span>
				<ul class="m-0 flex list-none flex-wrap items-center gap-2.5 p-0">
					{#each STACK as tech (tech.label)}
						<li>
							<span
								title={tech.label}
								class="inline-flex opacity-70 transition-opacity duration-200 hover:opacity-100"
							>
								<Icon src={tech.src} size={16} color={brandColor(tech.brand)} />
								<span class="sr-only">{tech.label}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>

			<p class="m-0 font-mono text-xs tracking-[0.06em] text-outline">
				{ui('footer.icons', locale)}
				<a
					href="https://nucleoapp.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-tertiary-container transition-colors hover:text-primary-container"
				>
					Nucleo
				</a>
			</p>
		</div>
	</div>
</footer>
