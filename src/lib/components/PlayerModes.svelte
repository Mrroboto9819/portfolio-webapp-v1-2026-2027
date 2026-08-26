<script lang="ts">
	// Shuffle and repeat, as one pair.
	//
	// Every surface that shows a transport needs exactly these two buttons with
	// exactly this behaviour, so they live here instead of being redrawn three
	// times. They drive the shared player, which means the mode set on the
	// landing page is the mode the admin bar shows, and vice versa.
	//
	// These are stroke SVGs rather than PixelIcon: the arcade set is a 7x7
	// bitmap grid, and neither of these glyphs survives that resolution — a
	// shuffle drawn in 49 cells reads as a bowtie.
	import { player } from '$lib/audio.svelte';

	let { size = 15 }: { size?: number } = $props();

	// The label says what the button will DO next, not what is currently set —
	// a screen reader user needs the outcome, and the cycle order is the same
	// one the tooltip explains.
	const repeatLabel = $derived(
		player.repeat === 'all'
			? 'Repeat one track'
			: player.repeat === 'one'
				? 'Stop at the end of the queue'
				: 'Repeat the whole queue'
	);
	const repeatTitle = $derived(
		player.repeat === 'all'
			? 'Repeat: whole queue'
			: player.repeat === 'one'
				? 'Repeat: this track'
				: 'Repeat: off'
	);

	const on = 'text-primary-container';
	const off = 'text-outline hover:text-on-surface-variant';
</script>

<button
	type="button"
	onclick={() => player.toggleShuffle()}
	aria-pressed={player.shuffle}
	aria-label={player.shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
	title={player.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
	class="p-1.5 transition-colors {player.shuffle ? on : off}"
>
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="square"
		aria-hidden="true"
	>
		<path d="M3 5h4l10 14h4M3 19h4l3-4M15 8l2-3h4" />
		<path d="M18 2l3 3-3 3M18 16l3 3-3 3" />
	</svg>
</button>

<button
	type="button"
	onclick={() => player.cycleRepeat()}
	aria-label={repeatLabel}
	title={repeatTitle}
	class="relative p-1.5 transition-colors {player.repeat === 'off' ? off : on}"
>
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="square"
		aria-hidden="true"
	>
		<path d="M4 8h13l-3-3M20 16H7l3 3" />
	</svg>
	<!-- Repeat-one is the same loop with a 1 in it; drawn as a corner badge so
	     the loop itself stays the same shape in all three states. -->
	{#if player.repeat === 'one'}
		<span
			class="absolute right-0 bottom-0 font-mono text-[9px] leading-none font-bold text-primary-container"
			aria-hidden="true"
		>
			1
		</span>
	{/if}
</button>
