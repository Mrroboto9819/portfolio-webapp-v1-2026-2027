<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { player, fmtTime } from '$lib/audio.svelte';
	import PixelIcon from '$lib/components/PixelIcon.svelte';
	import PlayerModes from '$lib/components/PlayerModes.svelte';
	import Switch from '$lib/components/admin/Switch.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import { readJSON, writeJSON } from '$lib/persist';
	import { toast } from '$lib/toast.svelte';
	import type { Song } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const FILTER_KEY = 'admin-playlist-filters';

	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	/** A filename someone will recognise in their downloads folder. */
	function fileNameFor(s: Song): string {
		const base = [s.artist, s.title].filter(Boolean).join(' - ') || 'track';
		return `${base.replace(/[\\/:*?"<>|]/g, '')}.mp3`;
	}

	// Two independent filters over the library. '' means "all" — chips derive
	// from whatever values actually exist, so an unused filter simply isn't
	// offered.
	//
	// Both survive navigation: auditioning one shelf, stepping into YouTube to
	// grab something and coming back should return to the same view rather than
	// resetting to everything. Not in the URL, unlike the entity list's search,
	// because this is a working preference rather than something to link
	// someone to.
	let byCategory = $state('');
	let byOwner = $state('');

	$effect(() => {
		const saved = readJSON<{ category: string; owner: string }>(FILTER_KEY, {
			category: '',
			owner: ''
		});
		byCategory = saved.category;
		byOwner = saved.owner;
	});

	function remember() {
		writeJSON(FILTER_KEY, { category: byCategory, owner: byOwner });
	}

	const categories = $derived([
		...new Set(data.songs.map((s) => s.category).filter(Boolean))
	] as string[]);
	const owners = $derived([...new Set(data.songs.map((s) => s.owner).filter(Boolean))] as string[]);

	const filtered = $derived(
		data.songs.filter(
			(s) => (!byCategory || s.category === byCategory) && (!byOwner || s.owner === byOwner)
		)
	);

	// The FILTERED list is the queue: next/prev and end-of-track advance stay
	// inside whatever shelf is being auditioned. This is the same shared player
	// the public site drives, so selecting a track here stops whatever was
	// playing — one <audio> element, never two fighting.
	$effect(() => {
		player.load(filtered);
	});

	const isCurrent = (s: Song) => player.current?.url === s.url;

	function play(i: number) {
		const s = filtered[i];
		if (isCurrent(s)) player.toggle();
		else player.playAt(i);
	}

	const chip = (active: boolean) =>
		`border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
			active
				? 'border-primary-container text-primary-container bg-primary-container/10'
				: 'border-outline/40 text-outline hover:border-primary-container hover:text-primary-container'
		}`;
</script>

<svelte:head>
	<title>Admin — {T('admin.playlist')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<h1 class="m-0 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">
			{T('admin.playlist')}
		</h1>
		<div class="flex gap-4">
			<a
				href="/admin/youtube"
				class="font-mono text-xs tracking-[0.1em] text-outline uppercase hover:text-primary-container"
			>
				{T('admin.grabFromYouTube')}
			</a>
			<!-- Music is where the site's queue is set, and that is a super-admin
			     job — so the link only exists for them. -->
			{#if data.session?.isSuperAdmin}
				<a
					href="/admin/songs"
					class="font-mono text-xs tracking-[0.1em] text-outline uppercase hover:text-primary-container"
				>
					{T('admin.manageInMusic')}
				</a>
			{/if}
		</div>
	</div>

	{#if !data.songs.length}
		<p class="font-mono text-xs text-outline">{T('admin.noTracks')}</p>
	{:else}
		<!-- filters -->
		{#if categories.length || owners.length}
			<div class="mb-6 flex flex-col gap-3">
				{#if categories.length}
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 font-mono text-xs tracking-[0.1em] text-outline uppercase">
							{T('admin.category')}
						</span>
						<button
							type="button"
							class={chip(byCategory === '')}
							onclick={() => {
								byCategory = '';
								remember();
							}}
						>
							{T('admin.all')}
						</button>
						{#each categories as c (c)}
							<button
								type="button"
								class={chip(byCategory === c)}
								onclick={() => {
									byCategory = c;
									remember();
								}}
							>
								{c}
							</button>
						{/each}
					</div>
				{/if}
				{#if owners.length}
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 font-mono text-xs tracking-[0.1em] text-outline uppercase">
							{T('admin.owner')}
						</span>
						<button
							type="button"
							class={chip(byOwner === '')}
							onclick={() => {
								byOwner = '';
								remember();
							}}
						>
							{T('admin.all')}
						</button>
						{#each owners as o (o)}
							<button
								type="button"
								class={chip(byOwner === o)}
								onclick={() => {
									byOwner = o;
									remember();
								}}
							>
								{o}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- transport -->
		<div class="glass hud-corners mb-6 border border-white/10 p-4">
			<div class="mb-1 flex items-center justify-between gap-4">
				<div class="flex min-w-0 items-center gap-3">
					{#if player.current?.image}
						<img
							src={player.current.image}
							alt=""
							class="h-12 w-12 shrink-0 border border-white/10 object-cover"
							loading="lazy"
						/>
					{/if}
					<div class="min-w-0">
						<div class="truncate font-mono text-sm text-on-surface">
							{player.current?.title ?? T('admin.nothingSelected')}
						</div>
						<div class="truncate font-mono text-xs text-outline">
							{player.current?.artist ?? T('admin.pickTrack')}
						</div>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						onclick={() => player.prev()}
						aria-label="Previous track"
						class="border border-outline/40 p-1.5 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
					>
						<PixelIcon icon="media-prev" size={16} />
					</button>
					<button
						type="button"
						onclick={() => player.toggle()}
						aria-label={player.playing ? 'Pause' : 'Play'}
						class="border border-primary-container/60 bg-primary-container/10 p-2 text-primary-container hover:bg-primary-container/20"
					>
						<PixelIcon icon={player.playing ? 'media-pause' : 'media-play'} size={16} />
					</button>
					<button
						type="button"
						onclick={() => player.next()}
						aria-label="Next track"
						class="border border-outline/40 p-1.5 text-on-surface-variant hover:border-primary-container hover:text-primary-container"
					>
						<PixelIcon icon="media-next" size={16} />
					</button>
				</div>
			</div>

			<div class="flex items-center gap-2">
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

				<!-- Shuffle and repeat drive the shared player, so the mode set here
				     is the mode the bottom bar and the public site show. -->
				<span class="ml-2 flex items-center">
					<PlayerModes />
				</span>

				<button
					type="button"
					onclick={() => player.toggleMute()}
					aria-label={player.muted ? 'Unmute' : 'Mute'}
					class="ml-2 text-outline hover:text-primary-container"
				>
					<PixelIcon
						icon={player.muted ? 'volume-mute' : 'volume-up'}
						hover={player.muted ? 'volume-up' : 'volume-mute'}
						size={16}
					/>
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

			{#if player.current?.credit}
				<p class="mt-2 mb-0 font-mono text-[11px] leading-snug text-outline">
					{player.current.credit}
				</p>
			{/if}
		</div>

		<!-- tracks -->
		<ul class="m-0 flex list-none flex-col p-0">
			{#each filtered as s, i (s.id)}
				<!-- The row is a container, not one big button: the visibility
				     control is interactive too, and a <button> cannot contain
				     another. Clicking the title area still plays the track. -->
				<li class="flex items-center gap-3 border-b border-white/5 pr-2">
					<button
						type="button"
						onclick={() => play(i)}
						class="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-primary-container/5 {isCurrent(
							s
						)
							? 'text-primary-container'
							: 'text-on-surface-variant'}"
					>
						<span class="w-7 shrink-0 text-right font-mono text-xs text-outline">
							{String(i + 1).padStart(2, '0')}
						</span>

						<span class="w-5 shrink-0" aria-hidden="true">
							{#if isCurrent(s) && player.playing}
								<span class="inline-flex h-3 items-end gap-[2px]">
									{#each [0, 1, 2] as b (b)}
										<span
											class="w-[2px] bg-primary-container"
											style="height: 100%; animation: pl-eq 800ms {b *
												140}ms ease-in-out infinite alternate"
										></span>
									{/each}
								</span>
							{:else}
								<!-- Always play here: the equaliser above is the only "playing"
							     state, so a selected-but-paused row must show the action its
							     click actually performs. -->
								<PixelIcon icon="media-play" size={14} />
							{/if}
						</span>

						{#if s.image}
							<img
								src={s.image}
								alt=""
								class="h-9 w-9 shrink-0 border border-white/10 object-cover"
								loading="lazy"
							/>
						{/if}

						<span class="min-w-0 flex-1">
							<span class="block truncate font-mono text-sm">{s.title}</span>
							<span class="block truncate font-mono text-xs text-outline">{s.artist ?? ''}</span>
						</span>

						{#if s.category}
							<span
								class="hidden shrink-0 border border-outline/30 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-outline uppercase sm:inline"
							>
								{s.category}
							</span>
						{/if}
						{#if s.owner}
							<span class="hidden shrink-0 font-mono text-xs text-tertiary-container md:inline">
								{s.owner}
							</span>
						{/if}
					</button>

					<!-- Straight to the device. A plain link with `download`, not a
					     fetch-and-blob: the file already sits behind the media gate,
					     and the browser streams it to disk without holding 3 MB in
					     memory first. -->
					<a
						href={s.url}
						download={fileNameFor(s)}
						title={T('admin.downloadTitle')}
						aria-label="{T('admin.download')} — {s.title}"
						class="shrink-0 border border-outline/40 p-1.5 text-outline transition-colors hover:border-primary-container hover:text-primary-container"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="square"
							aria-hidden="true"
						>
							<path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
						</svg>
					</a>

					<!-- Publishing: the switch for a super-admin, the state alone for
					     everyone else. The action re-checks the privilege — this is
					     presentation, not the control. -->
					{#if data.mayPublish}
						<form
							method="POST"
							action="?/visibility"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toast.success(
											s.isActive ? `“${s.title}” hidden` : `“${s.title}” is live on the site`
										);
										await invalidateAll();
									} else if (result.type === 'failure') {
										toast.error(String(result.data?.message ?? 'Could not change visibility'));
									}
								};
							}}
							class="flex shrink-0 items-center gap-2"
						>
							<input type="hidden" name="id" value={s.id} />
							<input type="hidden" name="next" value={String(!s.isActive)} />
							<span
								class="hidden w-14 text-right font-mono text-[10px] tracking-[0.08em] uppercase sm:inline {s.isActive
									? 'text-primary-container'
									: 'text-outline'}"
							>
								{s.isActive ? T('admin.onSite') : T('admin.hidden')}
							</span>
							<!-- Submit-on-click, which is exactly what Switch is built for. -->
							<Switch
								checked={Boolean(s.isActive)}
								label="{s.isActive ? 'Hide' : 'Show'} “{s.title}” on the public site"
							/>
						</form>
					{:else}
						<span
							class="shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase {s.isActive
								? 'text-primary-container'
								: 'text-outline'}"
							title="Only a super-admin can change this"
						>
							{s.isActive ? T('admin.onSite') : T('admin.hidden')}
						</span>
					{/if}
				</li>
			{/each}
		</ul>

		{#if !filtered.length}
			<p class="mt-4 font-mono text-xs text-outline">{T('admin.noMatches')}</p>
		{/if}

		<p class="mt-6 font-mono text-[11px] leading-snug text-outline">
			{T('admin.publishNote')}
		</p>
	{/if}
</div>

<style>
	@keyframes pl-eq {
		from {
			height: 30%;
		}
		to {
			height: 100%;
		}
	}
</style>
