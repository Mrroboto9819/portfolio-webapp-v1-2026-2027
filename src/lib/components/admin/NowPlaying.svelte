<script lang="ts">
	// The admin's persistent transport, pinned to the bottom of every screen.
	//
	// It drives the SAME shared player as the playlist page and the public site —
	// one <audio> element, several surfaces — so a track started on the playlist
	// keeps playing while its owner edits a blog post, and the controls here and
	// there can never disagree about what is playing.
	//
	// Two shapes, and the difference is deliberate:
	//
	//   collapsed  one thin line: title · artist, a progress bar that only
	//              REPORTS (not a control), and the transport. Small enough to
	//              forget about while working.
	//   expanded   cover art, times, a real draggable seek bar, shuffle/repeat.
	//
	// A collapsed bar is something you glance at, so its progress is a plain
	// div — a range input there invites a drag that would jump the track while
	// someone is reaching for a table row underneath it.
	//
	// Like every other surface, this one CANNOT start audio on its own: it only
	// renders state until someone presses play. See the note at the top of
	// audio.svelte.ts for why that rule is absolute.
	import { player, fmtTime } from '$lib/audio.svelte';
	import PixelIcon from '$lib/components/PixelIcon.svelte';
	import PlayerModes from '$lib/components/PlayerModes.svelte';
	import { readJSON, writeJSON } from '$lib/persist';
	import type { Song } from '$lib/types';

	let { songs = [] }: { songs?: Song[] } = $props();

	// Seed the queue ONLY when nothing has claimed it yet. The playlist page
	// hands the player a filtered subset — auditioning one category — and this
	// bar must not overwrite that the moment its owner navigates away.
	$effect(() => {
		if (!player.queue.length && songs.length) player.load(songs);
	});

	// Collapsed state survives navigation and reloads: someone who tucked the
	// bar away is not asking to do it again on every page.
	const KEY = 'admin-nowplaying-collapsed';
	let collapsed = $state(false);
	$effect(() => {
		collapsed = readJSON<boolean>(KEY, false);
	});
	function toggleCollapsed() {
		collapsed = !collapsed;
		writeJSON(KEY, collapsed);
	}

	const pct = $derived(
		player.duration > 0 ? Math.min(100, Math.max(0, (player.position / player.duration) * 100)) : 0
	);
</script>

{#if player.current}
	<!-- Starts where the sidebar ends (md:left-60): spanning the full width put
	     the bar on top of the rail's own footer — View site and Sign out — and
	     covered them. Below md the rail is not on screen, so the bar is
	     full-width there. -->
	<div
		class="glass fixed right-0 bottom-0 left-0 z-50 border-t md:left-60"
		style="border-top-color: rgba(0,220,230,0.28)"
		role="region"
		aria-label="Now playing"
	>
		{#if collapsed}
			<!-- ONE line: everything on the same row, nothing draggable. -->
			<div class="flex items-center gap-3 px-3 py-1.5 md:px-5">
				<button
					type="button"
					onclick={toggleCollapsed}
					aria-expanded="false"
					aria-label="Show player"
					class="shrink-0 text-outline transition-colors hover:text-primary-container"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M6 15l6-6 6 6" />
					</svg>
				</button>

				<span class="min-w-0 shrink truncate font-mono text-[11px] text-on-surface">
					{player.current.title}
					{#if player.current.artist}
						<span class="text-outline">· {player.current.artist}</span>
					{/if}
				</span>

				<!-- Reports progress, never accepts a drag: see the note above. -->
				<div
					class="hidden h-0.5 min-w-0 flex-1 bg-white/10 sm:block"
					role="progressbar"
					aria-label="Track progress"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(pct)}
				>
					<div class="h-full bg-primary-container" style="width: {pct}%"></div>
				</div>

				<span class="shrink-0 font-mono text-[10px] text-outline">
					{fmtTime(player.position)}
				</span>

				<div class="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onclick={() => player.prev()}
						aria-label="Previous track"
						class="p-1 text-on-surface-variant transition-colors hover:text-primary-container"
					>
						<PixelIcon icon="media-prev" size={13} />
					</button>
					<button
						type="button"
						onclick={() => player.toggle()}
						aria-label={player.playing ? 'Pause' : 'Play'}
						class="border border-primary-container/60 bg-primary-container/10 p-1.5 text-primary-container transition-colors hover:bg-primary-container/20"
					>
						<PixelIcon icon={player.playing ? 'media-pause' : 'media-play'} size={13} />
					</button>
					<button
						type="button"
						onclick={() => player.next()}
						aria-label="Next track"
						class="p-1 text-on-surface-variant transition-colors hover:text-primary-container"
					>
						<PixelIcon icon="media-next" size={13} />
					</button>
				</div>
			</div>
		{:else}
			<div class="flex items-center gap-3 px-4 py-2.5 md:px-6">
				<button
					type="button"
					onclick={toggleCollapsed}
					aria-expanded="true"
					aria-label="Hide player"
					class="shrink-0 text-outline transition-colors hover:text-primary-container"
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
						<path d="M18 9l-6 6-6-6" />
					</svg>
				</button>

				{#if player.current.image}
					<img
						src={player.current.image}
						alt=""
						class="h-11 w-11 shrink-0 border border-white/10 object-cover"
						loading="lazy"
					/>
				{/if}

				<div class="w-40 shrink-0 md:w-56">
					<div class="truncate font-mono text-xs text-on-surface">{player.current.title}</div>
					<div class="truncate font-mono text-[11px] text-outline">
						{player.current.artist ?? ''}
					</div>
				</div>

				<!-- Real seek: expanded is the shape you interact with. -->
				<span class="shrink-0 font-mono text-[11px] text-outline">{fmtTime(player.position)}</span>
				<input
					type="range"
					min="0"
					max={player.duration || 0}
					value={player.position}
					oninput={(e) => player.seek(+e.currentTarget.value)}
					aria-label="Seek"
					class="h-1 min-w-0 flex-1 accent-[#00f3ff]"
				/>
				<span class="shrink-0 font-mono text-[11px] text-outline">{fmtTime(player.duration)}</span>

				<div class="hidden shrink-0 items-center sm:flex">
					<PlayerModes />
				</div>

				<div class="flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						onclick={() => player.prev()}
						aria-label="Previous track"
						class="border border-outline/40 p-1.5 text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container"
					>
						<PixelIcon icon="media-prev" size={14} />
					</button>
					<button
						type="button"
						onclick={() => player.toggle()}
						aria-label={player.playing ? 'Pause' : 'Play'}
						class="border border-primary-container/60 bg-primary-container/10 p-2 text-primary-container transition-colors hover:bg-primary-container/20"
					>
						<PixelIcon icon={player.playing ? 'media-pause' : 'media-play'} size={14} />
					</button>
					<button
						type="button"
						onclick={() => player.next()}
						aria-label="Next track"
						class="border border-outline/40 p-1.5 text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container"
					>
						<PixelIcon icon="media-next" size={14} />
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
