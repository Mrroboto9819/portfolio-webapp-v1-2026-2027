<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/admin/Modal.svelte';
	import HoldButton from '$lib/components/admin/HoldButton.svelte';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Obj = { key: string; url: string; size: number; lastModified: string };
	type Ref = { entity: string; id: string; title: string };

	const IMAGE_EXT = new Set(['png', 'jpg', 'webp', 'avif', 'gif']);
	const extOf = (key: string) => key.slice(key.lastIndexOf('.') + 1).toLowerCase();

	// Albums are the top-level folders. Grouped here rather than in load so a
	// single invalidateAll() refreshes both the grid and every number.
	const albums = $derived.by(() => {
		const map = new Map<string, Obj[]>();
		for (const o of data.objects as Obj[]) {
			const folder = o.key.includes('/') ? o.key.slice(0, o.key.indexOf('/')) : '(root)';
			map.set(folder, [...(map.get(folder) ?? []), o]);
		}
		return [...map.entries()]
			.map(([name, objects]) => ({
				name,
				objects: objects.sort((a, b) => b.lastModified.localeCompare(a.lastModified)),
				bytes: objects.reduce((s, o) => s + o.size, 0)
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	});
	const totalBytes = $derived((data.objects as Obj[]).reduce((s, o) => s + o.size, 0));

	const fmtBytes = (n: number) =>
		n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

	let busy = $state(false);
	// The file a modal is acting on, plus the rename/move destination field.
	let moving = $state<Obj | null>(null);
	let dest = $state('');
	let deleting = $state<Obj | null>(null);
	// Filled from a 409: the records that still point at the file.
	let blockingRefs = $state<Ref[]>([]);

	function copyUrl(url: string) {
		navigator.clipboard?.writeText(url).then(
			() => toast.success('URL copied'),
			() => toast.error('Could not copy — select it by hand')
		);
	}

	function openMove(o: Obj) {
		moving = o;
		dest = o.key;
	}

	async function doMove() {
		if (!moving) return;
		busy = true;
		try {
			const res = await fetch('/api/v1/media/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: moving.key, dest })
			});
			const out = await res.json();
			if (!res.ok) throw new Error(out.message ?? `Move failed (${res.status})`);
			toast.success(
				out.refsUpdated
					? `Moved — ${out.refsUpdated} reference(s) updated`
					: 'Moved — nothing referenced it'
			);
			moving = null;
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Move failed');
		}
		busy = false;
	}

	async function doDelete() {
		if (!deleting) return;
		busy = true;
		try {
			const res = await fetch('/api/v1/media/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: deleting.key })
			});
			const out = await res.json();
			if (res.status === 409) {
				// Referenced: the server refused, and tells us by whom. Keep the
				// modal open and show the list — the fix happens in those records.
				blockingRefs = out.refs ?? [];
				toast.error(out.message ?? 'Still referenced');
			} else if (!res.ok) {
				throw new Error(out.message ?? `Delete failed (${res.status})`);
			} else {
				toast.success(`Deleted ${out.deleted}`);
				deleting = null;
				blockingRefs = [];
				await invalidateAll();
			}
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Delete failed');
		}
		busy = false;
	}

	const btn =
		'border border-outline/40 px-2.5 py-1 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container disabled:opacity-50';
</script>

<svelte:head>
	<title>Admin — Media</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<h1 class="m-0 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">Media</h1>
		<div class="flex items-center gap-4 font-mono text-xs text-on-surface-variant">
			<span>
				<span class="text-primary-container">{data.objects.length}</span> files ·
				<span class="text-primary-container">{fmtBytes(totalBytes)}</span> in the bucket
			</span>
			<button type="button" class={btn} onclick={() => invalidateAll()}>Refresh</button>
		</div>
	</div>

	{#if !data.configured}
		<p class="border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error">
			Object storage is not configured in this environment.
		</p>
	{:else if !albums.length}
		<p class="font-mono text-sm text-on-surface-variant">The bucket is empty.</p>
	{:else}
		{#each albums as album (album.name)}
			<section class="mb-8">
				<h2 class="mb-3 font-mono text-sm tracking-[0.1em] text-outline uppercase">
					{album.name}/
					<span class="ml-2 text-primary-container">{album.objects.length}</span>
					<span class="text-on-surface-variant">· {fmtBytes(album.bytes)}</span>
				</h2>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each album.objects as o (o.key)}
						<div class="flex flex-col gap-2 border border-outline/30 bg-surface-lowest/40 p-2">
							{#if IMAGE_EXT.has(extOf(o.key))}
								<img
									src={o.url}
									alt={o.key}
									loading="lazy"
									decoding="async"
									class="h-28 w-full border border-white/10 object-cover"
								/>
							{:else}
								<div
									class="flex h-28 w-full items-center justify-center border border-white/10 font-mono text-lg text-outline uppercase"
								>
									.{extOf(o.key)}
								</div>
							{/if}
							<span class="truncate font-mono text-xs text-on-surface-variant" title={o.key}>
								{o.key.slice(o.key.indexOf('/') + 1)}
							</span>
							<span class="font-mono text-xs text-outline">{fmtBytes(o.size)}</span>
							<div class="flex flex-wrap gap-1.5">
								<button type="button" class={btn} onclick={() => copyUrl(o.url)}>Copy</button>
								<button type="button" class={btn} onclick={() => openMove(o)}>Move</button>
								<button
									type="button"
									class="{btn} hover:border-error hover:text-error"
									onclick={() => {
										deleting = o;
										blockingRefs = [];
									}}
								>
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<!-- ============ move / rename ============ -->
<Modal open={moving !== null} onclose={() => (moving = null)} title="Move or rename">
	{#if moving}
		<div class="flex flex-col gap-3">
			<p class="m-0 font-mono text-xs break-all text-on-surface-variant">{moving.key}</p>
			<label class="font-mono text-xs tracking-[0.1em] text-outline uppercase" for="media-dest">
				New key — folder/name.ext, extension unchanged
			</label>
			<input
				id="media-dest"
				bind:value={dest}
				class="w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
			/>
			<p class="m-0 font-mono text-xs text-outline">
				Every database reference to the old URL is rewritten in the same operation, so posts and
				songs keep working.
			</p>
		</div>
	{/if}
	{#snippet footer()}
		<div class="flex justify-end gap-3">
			<button type="button" class={btn} onclick={() => (moving = null)}>Cancel</button>
			<button
				type="button"
				disabled={busy || !dest || dest === moving?.key}
				onclick={doMove}
				class="clip-corner bg-primary-container px-6 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
			>
				{busy ? 'Moving…' : 'Move'}
			</button>
		</div>
	{/snippet}
</Modal>

<!-- ============ delete ============ -->
<Modal
	open={deleting !== null}
	onclose={() => {
		deleting = null;
		blockingRefs = [];
	}}
	title="Delete file"
>
	{#if deleting}
		<p class="m-0 text-sm text-on-surface">
			Permanently delete
			<strong class="break-all text-error">{deleting.key}</strong>
			from the bucket?
		</p>
		{#if blockingRefs.length}
			<div class="mt-4 border border-error/40 bg-error/10 p-3">
				<p class="m-0 font-mono text-xs text-error">
					Refused — still referenced by:
				</p>
				<ul class="m-0 mt-2 list-none p-0 font-mono text-xs text-on-surface-variant">
					{#each blockingRefs as r (r.entity + r.id)}
						<li>{r.entity} — {r.title}</li>
					{/each}
				</ul>
				<p class="m-0 mt-2 font-mono text-xs text-outline">
					Edit those records (or move the file instead) and try again.
				</p>
			</div>
		{:else}
			<p class="mt-2 mb-0 font-mono text-xs text-on-surface-variant">
				The server refuses if anything still references it — a file in use cannot be deleted by
				accident.
			</p>
		{/if}
	{/if}
	{#snippet footer()}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<button
				type="button"
				class={btn}
				onclick={() => {
					deleting = null;
					blockingRefs = [];
				}}
			>
				Cancel
			</button>
			<div class="flex-1">
				{#key deleting}
					<HoldButton
						label="Hold to delete"
						confirmLabel="Keep holding…"
						doneLabel="Deleting…"
						duration={1400}
						onconfirm={doDelete}
					/>
				{/key}
			</div>
		</div>
	{/snippet}
</Modal>
