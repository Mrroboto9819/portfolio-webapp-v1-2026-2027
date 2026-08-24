<script lang="ts">
	import { adminApi, messageFrom } from '$lib/api';
	import { toast } from '$lib/toast.svelte';
	import HoldButton from '$lib/components/admin/HoldButton.svelte';

	let importing = $state(false);
	let file = $state<File | null>(null);
	let report = $state<Record<string, { created: number; updated: number; skipped: number }> | null>(
		null
	);

	async function runImport() {
		if (!file) return;
		importing = true;
		report = null;
		try {
			const text = await file.text();
			const { data } = await adminApi.post('/export', JSON.parse(text), {
				headers: { 'content-type': 'application/json' }
			});
			report = data.report;
			toast.success('Import finished');
		} catch (err) {
			toast.error(messageFrom(err));
		} finally {
			importing = false;
		}
	}

	const field =
		'w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';
</script>

<svelte:head><title>Admin — Data</title><meta name="robots" content="noindex" /></svelte:head>

<div class="max-w-3xl p-6 md:p-10">
	<h1 class="m-0 mb-2 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">Data</h1>
	<p class="m-0 mb-8 font-mono text-xs text-outline">
		Everything that makes this site itself lives in the database. One JSON file plus the object
		store is the whole thing — a backup, a way to seed production from here, and the migration path
		off this cluster.
	</p>

	<!-- ---- export ---- -->
	<div class="glass chamfer-tr mb-6 p-6">
		<h2 class="m-0 mb-2 font-mono text-sm tracking-[0.12em] text-secondary uppercase">Export</h2>
		<p class="m-0 mb-5 text-sm leading-relaxed text-on-surface-variant">
			Every collection including hidden rows and drafts, plus the profile. Media is referenced by
			URL rather than inlined — the file lists every asset so the object store can be synced
			alongside it.
		</p>
		<a
			href="/api/v1/export"
			download
			class="clip-corner inline-block bg-primary-container px-6 py-3 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed"
		>
			Download JSON
		</a>
	</div>

	<!-- ---- import ---- -->
	<div class="glass chamfer-tr p-6">
		<h2 class="m-0 mb-2 font-mono text-sm tracking-[0.12em] text-secondary uppercase">Import</h2>
		<p class="m-0 mb-2 text-sm leading-relaxed text-on-surface-variant">
			Rows are matched by id: an existing record is updated, a new one is created. Re-importing the
			same file twice is safe.
		</p>
		<p
			class="m-0 mb-5 border-l-2 border-error/60 pl-3 font-mono text-xs leading-relaxed text-error"
		>
			This writes to the live database. Export first.
		</p>

		<input
			type="file"
			accept="application/json,.json"
			class="{field} mb-4"
			disabled={importing}
			onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)}
		/>

		{#if file}
			<div class="mb-4 font-mono text-xs text-on-surface-variant">
				{file.name} · {(file.size / 1024).toFixed(1)} KB
			</div>
			<HoldButton
				label="Hold to import"
				confirmLabel="Keep holding…"
				doneLabel="Importing…"
				duration={1600}
				onconfirm={runImport}
			/>
		{/if}

		{#if report}
			<div class="mt-6 border-t border-white/10 pt-4">
				<div class="mb-3 font-mono text-xs tracking-[0.1em] text-tertiary-container uppercase">
					Result
				</div>
				<table class="w-full border-collapse text-left font-mono text-xs">
					<thead>
						<tr class="border-b border-white/10 text-outline">
							<th class="py-2">Collection</th>
							<th class="py-2 text-right">Created</th>
							<th class="py-2 text-right">Updated</th>
							<th class="py-2 text-right">Skipped</th>
						</tr>
					</thead>
					<tbody>
						{#each Object.entries(report) as [name, r] (name)}
							<tr class="border-b border-white/5">
								<td class="py-2 text-on-surface">{name}</td>
								<td class="py-2 text-right text-tertiary-container">{r.created}</td>
								<td class="py-2 text-right text-primary-container">{r.updated}</td>
								<td class="py-2 text-right {r.skipped ? 'text-error' : 'text-outline'}">
									{r.skipped}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
