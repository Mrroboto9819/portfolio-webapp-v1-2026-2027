<script lang="ts">
	import { player, fmtTime } from '$lib/audio.svelte';
	import type { Song } from '$lib/types';

	// Floating widget — desktop only. The same controls live inside the drawer
	// for mobile, driving the one shared player, so the two never disagree.
	let { songs }: { songs: Song[] } = $props();

	let open = $state(false);

	$effect(() => {
		player.load(songs);
	});

	// A cheap 5-bar equaliser: no Web Audio analyser, no per-frame work — it is
	// decoration, and decoration should not cost a rAF loop.
	const bars = [0, 1, 2, 3, 4];
</script>

{#if songs.length}
	<div class="pointer-events-none fixed right-6 bottom-6 z-40 hidden md:block">
		<div class="pointer-events-auto flex flex-col items-end gap-2">
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
						<input
							type="range"
							min="0"
							max={player.duration || 0}
							value={player.position}
							oninput={(e) => player.seek(+e.currentTarget.value)}
							aria-label="Seek"
							class="h-1 flex-1 accent-[#00f3ff]"
						/>
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
								onclick={() => player.toggle()}
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
				onclick={() => (open ? player.toggle() : (open = true))}
				aria-label={open ? (player.playing ? 'Pause' : 'Play') : 'Open music player'}
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
	@keyframes eq {
		from {
			height: 20%;
		}
		to {
			height: 100%;
		}
	}
</style>
