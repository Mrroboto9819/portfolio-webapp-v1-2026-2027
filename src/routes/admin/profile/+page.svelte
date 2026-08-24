<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { MetaEntry } from '$lib/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The metadata rows and avatar are edited locally, so they must be $state,
	// not $derived. But a save calls invalidateAll(), which replaces `data` —
	// without this effect the editor would keep showing the pre-save copy.
	// Re-seed only when the server's updatedAt actually changes, so typing is
	// never clobbered mid-edit.
	let rows = $state<MetaEntry[]>(structuredClone(data.profile.metadata ?? []));
	let avatar = $state(data.profile.avatar ?? '');
	let saving = $state(false);
	let syncedAt = $state(data.profile.updatedAt);

	$effect(() => {
		if (data.profile.updatedAt === syncedAt) return;
		syncedAt = data.profile.updatedAt;
		rows = structuredClone(data.profile.metadata ?? []);
		avatar = data.profile.avatar ?? '';
	});

	const addRow = () => (rows = [...rows, { key: '', value: '', accent: '' }]);
	const removeRow = (i: number) => (rows = rows.filter((_, n) => n !== i));
	const move = (i: number, by: number) => {
		const j = i + by;
		if (j < 0 || j >= rows.length) return;
		const next = [...rows];
		[next[i], next[j]] = [next[j], next[i]];
		rows = next;
	};

	const field =
		'border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';
</script>

<svelte:head><title>Admin — Profile</title><meta name="robots" content="noindex" /></svelte:head>

<div class="p-6 md:p-10">
	<h1 class="m-0 mb-2 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">Profile</h1>
	<p class="m-0 mb-8 font-mono text-xs text-outline">
		Everything here renders on the landing page. Metadata rows become the SYS_READOUT panel, in this
		order.
	</p>

	{#if form?.message}
		<p
			class="mb-4 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
			role="alert"
		>
			{form.message}
		</p>
	{:else if form?.saved}
		<p
			class="mb-4 border border-tertiary-container/40 bg-tertiary-container/10 px-3 py-2 font-mono text-xs text-tertiary-container"
		>
			Saved — the landing page is updated.
		</p>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
				await invalidateAll();
			};
		}}
		class="flex max-w-3xl flex-col gap-6"
	>
		<div class="glass chamfer-tr flex flex-col gap-5 p-6">
			<div class="grid gap-5 md:grid-cols-2">
				<label class="flex flex-col gap-2">
					<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase"
						>Display name *</span
					>
					<input name="displayName" value={data.profile.displayName ?? ''} class={field} required />
				</label>
				<label class="flex flex-col gap-2">
					<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Status label</span
					>
					<input name="statusLabel" value={data.profile.statusLabel ?? ''} class={field} />
				</label>
			</div>

			<label class="flex flex-col gap-2">
				<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Headline *</span>
				<textarea name="headline" rows="2" class={field} required
					>{data.profile.headline ?? ''}</textarea
				>
				<span class="font-mono text-xs text-outline"
					>One line per row — each becomes a line of the hero title.</span
				>
			</label>

			<label class="flex flex-col gap-2">
				<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Bio</span>
				<textarea name="bio" rows="4" class={field}>{data.profile.bio ?? ''}</textarea>
			</label>

			<div class="grid gap-5 md:grid-cols-2">
				<label class="flex flex-col gap-2">
					<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Version tag</span>
					<input name="version" value={data.profile.version ?? ''} class={field} />
				</label>

				<div class="flex flex-col gap-2">
					<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Avatar</span>
					<div class="flex items-center gap-3">
						{#if avatar}
							<img
								src={avatar}
								alt=""
								class="h-12 w-12 shrink-0 border border-white/10 object-cover"
							/>
						{/if}
						<input
							name="avatar"
							bind:value={avatar}
							list="asset-list"
							class="{field} min-w-0 flex-1"
						/>
					</div>
					<datalist id="asset-list">
						{#each data.assets as a (a)}<option value={a}></option>{/each}
					</datalist>
					<span class="font-mono text-xs text-outline">
						{data.assets.length} assets found — start typing to pick one.
					</span>
				</div>
			</div>
		</div>

		<!-- ---- metadata: the SYS_READOUT rows ---- -->
		<div class="glass chamfer-tr p-6">
			<div class="mb-4 flex items-center justify-between">
				<span class="font-mono text-sm tracking-[0.12em] text-secondary uppercase">Metadata</span>
				<button
					type="button"
					onclick={addRow}
					class="border border-primary-container/50 px-3 py-1.5 font-mono text-xs tracking-[0.1em] text-primary-container uppercase hover:bg-primary-container/10"
				>
					+ Row
				</button>
			</div>

			<div class="flex flex-col gap-2">
				{#each rows as row, i (i)}
					<div class="flex flex-wrap items-center gap-2">
						<input
							name="meta_key"
							bind:value={row.key}
							placeholder="KEY"
							class="{field} w-36 font-mono"
						/>
						<input
							name="meta_value"
							bind:value={row.value}
							placeholder="value"
							class="{field} min-w-0 flex-1 font-mono"
						/>
						<input
							name="meta_accent"
							bind:value={row.accent}
							placeholder="#hex"
							class="{field} w-24 font-mono"
						/>
						<div class="flex gap-1">
							<button
								type="button"
								onclick={() => move(i, -1)}
								aria-label="Move up"
								class="border border-outline/40 px-2 py-2 text-xs text-on-surface-variant hover:border-primary-container"
								>↑</button
							>
							<button
								type="button"
								onclick={() => move(i, 1)}
								aria-label="Move down"
								class="border border-outline/40 px-2 py-2 text-xs text-on-surface-variant hover:border-primary-container"
								>↓</button
							>
							<button
								type="button"
								onclick={() => removeRow(i)}
								aria-label="Remove"
								class="border border-error/40 px-2 py-2 text-xs text-error hover:bg-error/10"
								>✕</button
							>
						</div>
					</div>
				{:else}
					<p class="m-0 font-mono text-xs text-outline">
						No rows — the readout panel will be hidden.
					</p>
				{/each}
			</div>
		</div>

		<div>
			<button
				type="submit"
				disabled={saving}
				class="clip-corner bg-primary-container px-7 py-3 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
			>
				{saving ? 'Saving…' : 'Save profile'}
			</button>
		</div>
	</form>
</div>
