<script lang="ts">
	// An arcade icon that morphs.
	//
	// Every icon in the set lives on the same 7x7 grid (see $lib/arcade.ts), so
	// the transition between any two is a per-cell flip: the 49 rects never move
	// or change count, only which of them are lit. That is what a path-morphing
	// library cannot do here — there are no outlines to interpolate — and it is
	// also the look pixel art wants.
	//
	// Cells flip outward from the centre rather than all at once. A simultaneous
	// fade reads as a crossfade of two pictures; a staggered one reads as the
	// icon rearranging itself, which is the whole point.

	import { CELL, GRID, ORIGIN, STEP, VIEWBOX, mask, type ArcadeIcon } from '$lib/arcade';

	let {
		icon,
		hover = null,
		size = 20,
		color = null,
		duration = 260,
		stagger = 18,
		label = null,
		class: klass = ''
	}: {
		icon: ArcadeIcon;
		/** Morph to this one while the pointer (or keyboard focus) is on it. */
		hover?: ArcadeIcon | null;
		size?: number;
		/** Defaults to currentColor, so it inherits whatever the control is. */
		color?: string | null;
		duration?: number;
		/** Delay added per ring out from the centre, in ms. */
		stagger?: number;
		/** Give it an accessible name; without one it is decorative. */
		label?: string | null;
		class?: string;
	} = $props();

	let lit = $state(false);

	// Geometry is fixed for the whole set, so it is computed once per component
	// rather than per render: 49 cells with their position and their delay.
	//
	// The delay is the Chebyshev distance from the centre cell — a square ring
	// rather than a circle, which is what reads correctly on a 7x7 grid.
	const CENTRE = (GRID - 1) / 2;
	const cells = Array.from({ length: GRID * GRID }, (_, i) => {
		const cx = i % GRID;
		const cy = Math.floor(i / GRID);
		return {
			x: ORIGIN + cx * STEP - CELL / 2,
			y: ORIGIN + cy * STEP - CELL / 2,
			ring: Math.max(Math.abs(cx - CENTRE), Math.abs(cy - CENTRE))
		};
	});

	const shown = $derived(lit && hover ? hover : icon);
	const bits = $derived(mask(shown));
</script>

<svg
	viewBox="0 0 {VIEWBOX} {VIEWBOX}"
	width={size}
	height={size}
	class="pixel-icon inline-block shrink-0 {klass}"
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	onpointerenter={() => (lit = true)}
	onpointerleave={() => (lit = false)}
	style="--px-duration: {duration}ms"
>
	{#each cells as cell, i (i)}
		<rect
			x={cell.x}
			y={cell.y}
			width={CELL}
			height={CELL}
			fill={color ?? 'currentColor'}
			class="cell"
			class:on={bits[i] === '1'}
			style="transition-delay: {cell.ring * stagger}ms"
		/>
	{/each}
</svg>

<style>
	/* shape-rendering keeps the cells hard-edged at any size: this is pixel art,
	   and antialiased pixels are just blurry pixels. */
	.pixel-icon {
		shape-rendering: crispEdges;
		overflow: visible;
	}

	.cell {
		opacity: 0;
		/* Scaled from its own centre, not the viewBox origin — without
		   `transform-box` a rect transforms about the top-left of the SVG. */
		transform: scale(0.35);
		transform-box: fill-box;
		transform-origin: center;
		transition:
			opacity var(--px-duration) ease,
			transform var(--px-duration) cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.cell.on {
		opacity: 1;
		transform: scale(1);
	}

	/* With effects off, or for anyone who asked for less motion, the icon still
	   changes — it just changes instantly, with no stagger to sit through. */
	:global(.no-fx) .cell,
	.cell:where(:global(.no-fx) *) {
		transition: none;
		transition-delay: 0ms !important;
	}

	@media (prefers-reduced-motion: reduce) {
		.cell {
			transition-duration: 1ms;
			transition-delay: 0ms !important;
			transform: scale(1);
		}
	}
</style>
