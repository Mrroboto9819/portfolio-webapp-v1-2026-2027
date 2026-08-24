<script lang="ts">
	import { player, fmtTime } from '$lib/audio.svelte';
	import type { Song } from '$lib/types';

	// Floating widget — desktop only. The same controls live inside the drawer
	// for mobile, driving the one shared player, so the two never disagree.
	let { songs }: { songs: Song[] } = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	let hovering = $state(false);

	// Click-outside closes the PANEL only — never stops playback. Collapsing a
	// player that is still playing is expected; silencing it because someone
	// clicked the page would not be.
	function onPointerDown(e: PointerEvent) {
		if (!open || !root) return;
		if (!root.contains(e.target as Node)) open = false;
	}

	// Opacity follows the pointer and keyboard focus ONLY — not whether the
	// panel happens to be open. An expanded panel left sitting at full strength
	// competes with the page for as long as it stays open; fading it the moment
	// the pointer leaves keeps it available without keeping it loud.
	const solid = $derived(hovering);

	// Is the track playing an Oliver Tree song? The seek handle becomes his
	// face for those, spinning while the audio runs.
	const isTree = $derived(/oliver\s*tree/i.test(String(player.current?.artist ?? '')));

	// Progress as a percentage, for positioning that handle along the track.
	const pct = $derived(
		player.duration > 0 ? Math.min(100, Math.max(0, (player.position / player.duration) * 100)) : 0
	);

	$effect(() => {
		player.load(songs);
	});

	// Try to start on the reader's first interaction.
	//
	// Honest about the platform: Chrome and Safari grant autoplay only on a
	// real activation gesture — click, tap or keypress. A scroll does NOT
	// count, so scrolling alone may not start it; the attempt is made anyway
	// because it costs nothing and some engines (and any prior interaction on
	// the origin) do allow it. The first click or tap will always work.
	//
	// It fires ONCE and never fights the reader: if they pause, that decision
	// stands for the rest of the visit.
	let autoTried = false;

	async function tryAutoplay() {
		if (autoTried || !songs.length) return;
		autoTried = true;
		// sessionStorage so "I paused this" survives navigation but not a new visit.
		try {
			if (sessionStorage.getItem('music-optout') === '1') return;
		} catch {
			/* private mode — just proceed */
		}

		await player.playAt(player.index);

		// Expand ONLY when playback actually began on its own. Sound starting
		// with no visible source is disorienting, so the panel shows what is
		// playing and where the controls are.
		//
		// Gated on player.playing rather than on having called play(): the
		// browser may refuse autoplay outright, and popping open a panel for
		// audio that never started would be worse than staying collapsed.
		//
		// Manual starts are deliberately excluded — the reader pressed play
		// themselves, so they already know, and expanding under their cursor
		// would move the very control they just used.
		if (player.playing) open = true;
	}

	function optOutOnPause() {
		// Only a deliberate pause counts, not the gap between tracks.
		try {
			if (autoTried && !player.playing) sessionStorage.setItem('music-optout', '1');
		} catch {
			/* ignore */
		}
	}

	// A cheap 5-bar equaliser: no Web Audio analyser, no per-frame work — it is
	// decoration, and decoration should not cost a rAF loop.
	const bars = [0, 1, 2, 3, 4];
</script>

<!-- Must be top level: svelte:window cannot live inside a block. -->
<svelte:window
	onpointerdown={onPointerDown}
	onscroll={tryAutoplay}
	onkeydown={tryAutoplay}
	ontouchstart={tryAutoplay}
	onclick={tryAutoplay}
/>

{#if songs.length}
	<div class="pointer-events-none fixed right-6 bottom-6 z-40 hidden md:block">
		<div
			bind:this={root}
			onmouseenter={() => (hovering = true)}
			onmouseleave={() => (hovering = false)}
			onfocusin={() => (hovering = true)}
			onfocusout={() => (hovering = false)}
			role="region"
			aria-label="Music player"
			class="pointer-events-auto flex flex-col items-end gap-2 transition-opacity duration-300"
			class:opacity-100={solid}
			class:opacity-55={!solid}
		>
			{#if open}
				<div class="glass chamfer-tr hud-corners relative w-72 p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="font-mono text-xs tracking-[0.14em] text-secondary uppercase">
							// AUDIO_LINK
						</span>
						<button
							type="button"
							onclick={() => (open = false)}
							aria-label="Collapse player"
							class="text-outline transition-colors hover:text-primary-container"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path d="M6 6l12 12M18 6L6 18" />
							</svg>
						</button>
					</div>

					<div class="mb-1 truncate font-mono text-xs text-on-surface">
						{player.current?.title ?? '—'}
					</div>
					<div class="mb-3 truncate font-mono text-xs text-outline">
						{player.current?.artist ?? ''}
					</div>

					<!-- seek -->
					<div class="mb-1 flex items-center gap-2">
						<span class="font-mono text-xs text-outline">{fmtTime(player.position)}</span>
						<!-- The range input stays the real control — it keeps keyboard
						     seeking, drag and screen-reader semantics. For an Oliver
						     Tree track its thumb is hidden and an image is overlaid at
						     the same position instead: a native thumb cannot carry a
						     picture, and animating a ::-webkit-slider-thumb is not
						     reliable across engines. The overlay is pointer-events:none
						     so every click still lands on the input underneath. -->
						<div class="relative flex-1">
							<input
								type="range"
								min="0"
								max={player.duration || 0}
								value={player.position}
								oninput={(e) => player.seek(+e.currentTarget.value)}
								aria-label="Seek"
								class="h-1 w-full accent-[#00f3ff]"
								class:tree-track={isTree}
								style={isTree
									? `--tree-fill: linear-gradient(to right, #00f3ff ${pct}%, rgba(132,148,149,.35) ${pct}%)`
									: ''}
							/>
							{#if isTree}
								<img
									src="/images/tree-dot.png"
									alt=""
									aria-hidden="true"
									class="tree-dot"
									class:bouncing={player.playing}
									style="left: {pct}%"
								/>
							{/if}
						</div>
						<span class="font-mono text-xs text-outline">{fmtTime(player.duration)}</span>
					</div>

					<!-- transport -->
					<div class="mt-3 flex items-center justify-between">
						<div class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => player.prev()}
								aria-label="Previous track"
								class="border border-outline/40 p-1.5 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"><path d="M6 5h2v14H6zm3 7l9-7v14z" /></svg
								>
							</button>
							<button
								type="button"
								onclick={() => {
									player.toggle();
									optOutOnPause();
								}}
								aria-label={player.playing ? 'Pause' : 'Play'}
								class="border border-primary-container/60 bg-primary-container/10 p-2 text-primary-container hover:bg-primary-container/20"
							>
								{#if player.playing}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg
									>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg
									>
								{/if}
							</button>
							<button
								type="button"
								onclick={() => player.next()}
								aria-label="Next track"
								class="border border-outline/40 p-1.5 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"><path d="M16 5h2v14h-2zM6 5l9 7-9 7z" /></svg
								>
							</button>
						</div>

						<div class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => player.toggleMute()}
								aria-label={player.muted ? 'Unmute' : 'Mute'}
								class="text-outline hover:text-primary-container"
							>
								{#if player.muted}
									<svg
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6" /></svg
									>
								{:else}
									<svg
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM17 8a5 5 0 010 8" /></svg
									>
								{/if}
							</button>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={player.volume}
								oninput={(e) => player.setVolume(+e.currentTarget.value)}
								aria-label="Volume"
								class="h-1 w-16 accent-[#00f3ff]"
							/>
						</div>
					</div>

					<!-- queue -->
					<div class="mt-4 border-t border-white/10 pt-3">
						<div class="mb-2 font-mono text-xs tracking-[0.1em] text-outline uppercase">Queue</div>
						<ul class="m-0 flex list-none flex-col gap-1 p-0">
							{#each songs as s, i (s.id)}
								<li>
									<button
										type="button"
										onclick={() => player.playAt(i)}
										class="flex w-full items-baseline gap-2 text-left font-mono text-xs transition-colors {i ===
										player.index
											? 'text-primary-container'
											: 'text-outline hover:text-on-surface-variant'}"
									>
										<span class="shrink-0">{String(i + 1).padStart(2, '0')}</span>
										<span class="truncate">{s.title}</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if player.current?.credit}
							<p class="mt-3 mb-0 font-mono text-[11px] leading-snug text-outline">
								{player.current.credit}
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- collapsed pill -->
			<button
				type="button"
				onclick={() => (open = !open)}
				aria-label={open ? 'Collapse music player' : 'Open music player'}
				class="glass clip-corner group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:border-primary-container/50"
			>
				<span class="flex h-4 items-end gap-[2px]" aria-hidden="true">
					{#each bars as b (b)}
						<span
							class="w-[2px] bg-primary-container transition-all"
							style="height: {player.playing ? 30 + ((b * 37) % 70) : 15}%; {player.playing
								? `animation: eq 900ms ${b * 120}ms ease-in-out infinite alternate`
								: ''}"
						></span>
					{/each}
				</span>
				<span class="font-mono text-xs tracking-[0.1em] text-primary-container uppercase">
					{player.playing ? 'Playing' : 'Audio'}
				</span>
			</button>
		</div>
	</div>
{/if}

<style>
	/* Oliver Tree seek handle.
	   Setting `appearance: none` on the THUMB alone does nothing — Chrome
	   ignores thumb sizing unless the input itself has had its appearance
	   reset first, which is why the cyan dot kept drawing under the image.
	   Resetting the input also removes the native track, so the track is
	   redrawn here as a gradient: filled to the current position, dim after. */
	.tree-track {
		appearance: none;
		-webkit-appearance: none;
		height: 2px;
		background: transparent;
		cursor: pointer;
	}
	.tree-track::-webkit-slider-runnable-track {
		height: 2px;
		border-radius: 2px;
		background: var(--tree-fill);
	}
	.tree-track::-moz-range-track {
		height: 2px;
		border-radius: 2px;
		background: var(--tree-fill);
	}
	/* The handle IS the image, so the native thumb is removed entirely rather
	   than hidden behind it. */
	.tree-track::-webkit-slider-thumb {
		appearance: none;
		-webkit-appearance: none;
		width: 0;
		height: 0;
		border: 0;
	}
	.tree-track::-moz-range-thumb {
		width: 0;
		height: 0;
		border: 0;
		background: transparent;
	}
	.tree-track:focus-visible {
		outline: 1px solid var(--color-primary-container);
		outline-offset: 4px;
	}

	.tree-dot {
		position: absolute;
		top: 50%;
		width: 26px;
		height: 26px;
		/* Centred on its own progress point AND on the line. The bounce below
		   re-declares both parts, since a transform replaces rather than adds. */
		transform: translate(-50%, -50%);
		pointer-events: none;
		/* No transition on `left`: position lands every timeupdate tick and
		   easing between them makes the handle lag the audio. */
	}

	/* Bounce, not spin — a fixed musical tempo (~140bpm) rather than true beat
	   detection, which would mean routing the audio through an AnalyserNode and
	   risking silence if the graph ever fails. Only runs while playing, so a
	   still handle means paused. */
	.tree-dot.bouncing {
		animation: tree-bounce 428ms cubic-bezier(0.3, 0, 0.4, 1) infinite alternate;
	}

	@keyframes tree-bounce {
		from {
			transform: translate(-50%, -50%) translateY(3px) scale(0.94);
		}
		to {
			transform: translate(-50%, -50%) translateY(-4px) scale(1.06);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tree-dot.bouncing {
			animation: none;
		}
	}

	@keyframes eq {
		from {
			height: 20%;
		}
		to {
			height: 100%;
		}
	}
</style>
