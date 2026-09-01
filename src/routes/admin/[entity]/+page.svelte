<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import DataTable from '$lib/components/admin/DataTable.svelte';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import Modal from '$lib/components/admin/Modal.svelte';
	import HoldButton from '$lib/components/admin/HoldButton.svelte';
	import FileUpload from '$lib/components/admin/FileUpload.svelte';
	import { LOCALES, LOCALE_LABEL, TRANSLATABLE, t } from '$lib/i18n';
	import { toast } from '$lib/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Row = Record<string, unknown> & { id?: string };

	let editing = $state<Row | null>(null);
	let deleting = $state<Row | null>(null);
	let saving = $state(false);
	// One editor per language for a translatable markdown field; the toolbar
	// acts on whichever editor last had focus.
	let bodyEls = $state<Record<string, HTMLTextAreaElement | null>>({});
	let mdLocale = $state<string>('en');
	// Editable, so it must be $state — but the URL is the source of truth. Without
	// this resync, navigating back (or clearing the search) would leave a stale
	// term sitting in the box while the table showed different rows.
	let search = $state(data.q);
	$effect(() => {
		search = data.q;
	});
	// Uploader fields are bound, so they need their own state keyed per field.
	let uploads = $state<Record<string, string>>({});
	// Saving mid-upload would store an empty URL and lose the file, so Save is
	// blocked until every in-flight transfer settles.
	let uploading = $state<Record<string, boolean>>({});
	const busyUploading = $derived(Object.values(uploading).some(Boolean));

	const columns = $derived(data.schema.fields.filter((f) => f.column));
	const titleOf = (row: Row) => String(row[data.schema.titleField] ?? '(untitled)');

	// Every upload field must hold a STRING before the modal renders.
	// `bind:value` against an undefined entry throws props_invalid_value —
	// FileUpload's `value` is $bindable with a '' fallback — and that throw
	// happens during render, so the modal never appears at all.
	function seedUploads(row: Row): Record<string, string> {
		return Object.fromEntries(
			data.schema.fields
				.filter((f) => f.type === 'image' || f.type === 'audio')
				.map((f) => [f.name, String(row[f.name] ?? '')])
		);
	}

	function openNew() {
		editing = { isActive: true };
		uploads = seedUploads({});
	}
	function openEdit(row: Row) {
		editing = row;
		uploads = seedUploads(row);
	}

	function valueFor(row: Row | null, name: string, type: string): string {
		const v = row?.[name];
		if (v === undefined || v === null) return '';
		if (type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
		if (typeof v === 'object') return t(v as never, 'en');
		return String(v);
	}

	// Fields this entity stores per language. The editor shows one input per
	// locale for these; everything else stays a single input.
	const translatable = $derived(new Set(TRANSLATABLE[data.entity] ?? []));

	/** Value of one locale of a translatable field. */
	function localeValue(row: Row | null, name: string, loc: string): string {
		const v = row?.[name];
		if (v === undefined || v === null) return '';
		if (typeof v === 'object') return ((v as Record<string, string>)[loc] ?? '') as string;
		// Legacy plain string: it is the English copy, so seed EN and leave ES blank.
		return loc === 'en' ? String(v) : '';
	}

	// Search round-trips through the URL like sort and paging, so the server
	// filters and the result is linkable.
	function submitSearch(e: Event) {
		e.preventDefault();
		const params = new URLSearchParams(pageState.url.searchParams);
		if (search.trim()) params.set('q', search.trim());
		else params.delete('q');
		params.delete('page');
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	function surround(before: string, after = before, placeholder = 'text') {
		const el = bodyEls[mdLocale] ?? bodyEls.en;
		if (!el) return;
		const { selectionStart: s, selectionEnd: e, value } = el;
		const selected = value.slice(s, e) || placeholder;
		el.value = value.slice(0, s) + before + selected + after + value.slice(e);
		el.focus();
		el.setSelectionRange(s + before.length, s + before.length + selected.length);
	}

	const tools = [
		{ label: 'H2', run: () => surround('\n## ', '\n', 'Heading') },
		{ label: 'H3', run: () => surround('\n### ', '\n', 'Heading') },
		{ label: 'B', run: () => surround('**', '**', 'bold') },
		{ label: 'I', run: () => surround('_', '_', 'italic') },
		{ label: 'Link', run: () => surround('[', '](https://)', 'label') },
		{ label: 'Image', run: () => surround('![', '](/cdn/portafolio/…)', 'alt') },
		{ label: 'Code', run: () => surround('\n```\n', '\n```\n', 'code') },
		{ label: 'Quote', run: () => surround('\n> ', '\n', 'quote') },
		{ label: 'List', run: () => surround('\n- ', '\n', 'item') }
	];

	const field =
		'w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';

	// ---- posts-only tooling: bucket image uploads + JSON import ----
	// Images go to the bucket FIRST so their /cdn URLs exist to paste into
	// markdown; a JSON file in the API's own shape creates or updates a post in
	// one step ("status": "published" in the file = fast publish).
	let imagesInput = $state<HTMLInputElement | null>(null);
	let jsonInput = $state<HTMLInputElement | null>(null);
	let uploadedUrls = $state<{ name: string; url: string }[]>([]);
	let toolBusy = $state(false);

	async function uploadImages(files: FileList | null) {
		if (!files?.length) return;
		toolBusy = true;
		for (const file of files) {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('folder', 'posts');
			try {
				const res = await fetch('/api/v1/uploads', { method: 'POST', body: fd });
				const out = await res.json();
				if (!res.ok) throw new Error(out.message ?? `Upload failed (${res.status})`);
				uploadedUrls = [...uploadedUrls, { name: file.name, url: out.url }];
			} catch (e) {
				toast.error(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`);
			}
		}
		toolBusy = false;
		if (imagesInput) imagesInput.value = '';
	}

	function copyUrl(url: string) {
		navigator.clipboard?.writeText(url).then(
			() => toast.success('URL copied'),
			() => toast.error('Could not copy — select it by hand')
		);
	}

	async function importJson(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		toolBusy = true;
		try {
			const doc = JSON.parse(await file.text());
			if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
				throw new Error('The file must contain one JSON object.');
			}
			if (!doc.title || !doc.body) throw new Error('The JSON needs at least "title" and "body".');

			// An "id" — or a slug that already exists — updates instead of
			// creating, so re-importing a corrected file is idempotent.
			let id: string | null = typeof doc.id === 'string' ? doc.id : null;
			if (!id && typeof doc.slug === 'string') {
				const listRes = await fetch('/api/v1/posts?all=true');
				const list = await listRes.json().catch(() => ({ items: [] }));
				id = (list.items ?? []).find((p: { slug?: string }) => p.slug === doc.slug)?.id ?? null;
			}

			const { id: _drop, ...payload } = doc;
			const res = await fetch(id ? `/api/v1/posts/${id}` : '/api/v1/posts', {
				method: id ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const out = await res.json();
			if (!res.ok) throw new Error(out.message ?? `Import failed (${res.status})`);
			toast.success(id ? `Updated "${doc.slug ?? id}"` : `Created "${out.slug ?? out.id}"`);
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Import failed');
		}
		toolBusy = false;
		if (jsonInput) jsonInput.value = '';
	}
</script>

<svelte:head>
	<title>Admin — {data.schema.label}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<h1 class="m-0 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">
			{data.schema.label}
		</h1>
		<button
			type="button"
			onclick={openNew}
			class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed"
		>
			+ New
		</button>
	</div>

	{#if data.entity === 'posts'}
		<div class="mb-6 flex flex-col gap-3 border border-outline/30 bg-surface-lowest/40 p-4">
			<div class="flex flex-wrap items-center gap-3">
				<button
					type="button"
					disabled={toolBusy}
					onclick={() => imagesInput?.click()}
					class="border border-outline/40 px-4 py-2 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container disabled:opacity-50"
				>
					Upload images
				</button>
				<button
					type="button"
					disabled={toolBusy}
					onclick={() => jsonInput?.click()}
					class="border border-outline/40 px-4 py-2 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container disabled:opacity-50"
				>
					Import JSON
				</button>
				{#if toolBusy}<span class="font-mono text-xs text-outline">Working…</span>{/if}
				<span class="font-mono text-xs text-outline">
					Images land in the bucket under posts/ — copy the URL into your markdown. JSON in the
					API's shape creates, or updates when the id or slug already exists.
				</span>
			</div>
			<input
				bind:this={imagesInput}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
				multiple
				class="hidden"
				onchange={(e) => uploadImages(e.currentTarget.files)}
			/>
			<input
				bind:this={jsonInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={(e) => importJson(e.currentTarget.files)}
			/>
			{#if uploadedUrls.length}
				<ul class="m-0 flex list-none flex-col gap-1.5 p-0">
					{#each uploadedUrls as u (u.url)}
						<li class="flex min-w-0 items-center gap-2 font-mono text-xs">
							<span class="max-w-40 truncate text-on-surface-variant">{u.name}</span>
							<code class="min-w-0 truncate text-primary-container">{u.url}</code>
							<button
								type="button"
								onclick={() => copyUrl(u.url)}
								class="shrink-0 border border-outline/40 px-2 py-0.5 uppercase hover:border-primary-container hover:text-primary-container"
							>
								Copy
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if form?.message}
		<p
			class="mb-4 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<form onsubmit={submitSearch} class="mb-4 flex gap-2" role="search">
		<input
			bind:value={search}
			placeholder="Search…"
			aria-label="Search {data.schema.label}"
			class="{field} max-w-xs font-mono text-xs"
		/>
		<button
			type="submit"
			class="border border-outline/40 px-4 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container"
		>
			Search
		</button>
		{#if data.q}
			<a
				href={pageState.url.pathname}
				class="flex items-center px-3 font-mono text-xs text-outline hover:text-primary-container"
				>Clear</a
			>
		{/if}
	</form>

	<DataTable
		{columns}
		rows={data.items as Row[]}
		sort={data.sort}
		dir={data.dir}
		onedit={openEdit}
		ondelete={(row) => (deleting = row)}
	/>

	<Pagination page={data.page} pages={data.pages} total={data.total} perPage={data.perPage} />
</div>

<!-- ============ editor modal ============ -->
<Modal
	open={editing !== null}
	onclose={() => (editing = null)}
	title={editing?.id ? `Edit — ${titleOf(editing)}` : 'New record'}
	size="lg"
>
	{#if editing}
		<form
			id="entity-form"
			method="POST"
			action="?/save"
			use:enhance={() => {
				saving = true;
				return async ({ update, result }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') {
						toast.success('Saved');
						editing = null;
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error(String(result.data?.message ?? 'Save failed'));
					}
				};
			}}
			class="flex flex-col gap-5"
		>
			{#if editing.id}<input type="hidden" name="id" value={editing.id} />{/if}

			{#each data.schema.fields as f (f.name)}
				<div class="flex flex-col gap-2">
					{#if f.type === 'image' || f.type === 'audio'}
						<FileUpload
							bind:value={uploads[f.name]}
							folder={data.entity}
							label={f.label}
							kind={f.type === 'audio' ? 'audio' : 'image'}
							onbusy={(b) => (uploading[f.name] = b)}
						/>
						<input type="hidden" name={f.name} value={uploads[f.name] ?? ''} />
					{:else}
						<label class="font-mono text-xs tracking-[0.1em] text-outline uppercase" for={f.name}>
							{f.label}{#if f.required}<span class="text-error"> *</span>{/if}
						</label>

						{#if f.type === 'boolean'}
							<input
								id={f.name}
								name={f.name}
								type="checkbox"
								checked={editing[f.name] !== false}
								class="cyber-switch"
							/>
						{:else if f.type === 'select'}
							<select
								id={f.name}
								name={f.name}
								value={valueFor(editing, f.name, f.type) || f.options?.[0]}
								class={field}
							>
								{#each f.options ?? [] as opt (opt)}<option value={opt}>{opt}</option>{/each}
							</select>
						{:else if f.type === 'markdown'}
							<div class="flex flex-wrap gap-1.5">
								{#each tools as t (t.label)}
									<button
										type="button"
										onclick={t.run}
										class="border border-outline/40 px-2.5 py-1 font-mono text-xs text-on-surface-variant hover:border-primary-container hover:text-primary-container"
									>
										{t.label}
									</button>
								{/each}
								{#if editing.slug}
									<a
										href="/blog/{editing.slug}"
										target="_blank"
										rel="noopener"
										class="ml-auto border border-primary-container/50 px-2.5 py-1 font-mono text-xs text-primary-container hover:bg-primary-container/10"
									>
										Preview ↗
									</a>
								{/if}
							</div>
							{#if translatable.has(f.name)}
								<!-- One editor per language, like the plain text fields: the
								     save action reads name__en / name__es. A single textarea
								     named `body` here is what used to WIPE bodies on save —
								     patchFrom never saw the per-locale names it expects. -->
								{#each LOCALES as loc (loc)}
									<div class="flex items-start gap-2">
										<span class="mt-2.5 w-7 shrink-0 font-mono text-xs tracking-[0.1em] text-outline">
											{LOCALE_LABEL[loc]}
										</span>
										<textarea
											bind:this={bodyEls[loc]}
											name="{f.name}__{loc}"
											rows="12"
											onfocus={() => (mdLocale = loc)}
											value={localeValue(editing, f.name, loc)}
											class="{field} flex-1 font-mono leading-relaxed"
										></textarea>
									</div>
								{/each}
							{:else}
								<textarea
									bind:this={bodyEls.en}
									id={f.name}
									name={f.name}
									rows="16"
									value={valueFor(editing, f.name, f.type)}
									class="{field} font-mono leading-relaxed"
								></textarea>
							{/if}
						{:else if translatable.has(f.name)}
							<!-- One input per language. The save action reassembles them
							     into { en, es }; a blank locale simply falls back. -->
							<div class="flex flex-col gap-2">
								{#each LOCALES as loc (loc)}
									<div class="flex items-start gap-2">
										<span
											class="mt-2.5 w-7 shrink-0 font-mono text-xs tracking-[0.1em] text-outline"
										>
											{LOCALE_LABEL[loc]}
										</span>
										{#if f.type === 'textarea'}
											<textarea
												name="{f.name}__{loc}"
												rows="3"
												value={localeValue(editing, f.name, loc)}
												class="{field} flex-1"
											></textarea>
										{:else}
											<input
												name="{f.name}__{loc}"
												type="text"
												value={localeValue(editing, f.name, loc)}
												class="{field} flex-1"
											/>
										{/if}
									</div>
								{/each}
							</div>
						{:else if f.type === 'textarea'}
							<textarea
								id={f.name}
								name={f.name}
								rows="3"
								value={valueFor(editing, f.name, f.type)}
								class={field}
							></textarea>
						{:else}
							<input
								id={f.name}
								name={f.name}
								type={f.type === 'number' ? 'number' : 'text'}
								value={valueFor(editing, f.name, f.type)}
								class={field}
							/>
						{/if}
					{/if}

					{#if f.help}<span class="font-mono text-xs text-outline">{f.help}</span>{/if}
				</div>
			{/each}
		</form>
	{/if}

	{#snippet footer()}
		<div class="flex justify-end gap-3">
			<button
				type="button"
				onclick={() => (editing = null)}
				class="clip-corner border border-outline/50 px-6 py-2.5 font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase hover:bg-white/5"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="entity-form"
				disabled={saving}
				class="clip-corner bg-primary-container px-6 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
			>
				{saving ? 'Saving…' : 'Save'}
			</button>
		</div>
	{/snippet}
</Modal>

<!-- ============ delete confirmation ============ -->
<Modal open={deleting !== null} onclose={() => (deleting = null)} title="Delete record">
	{#if deleting}
		<div class="flex items-start gap-4">
			<span class="mt-0.5 shrink-0 text-error">
				<svg
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<path d="M12 3l9 16H3z" /><path d="M12 9v5M12 17h.01" />
				</svg>
			</span>
			<div class="min-w-0">
				<p class="m-0 text-sm text-on-surface">
					You are about to permanently delete
					<strong class="break-words text-error">{titleOf(deleting)}</strong>.
				</p>
				<p class="mt-2 mb-0 font-mono text-xs text-on-surface-variant">
					This removes the record from the database. It cannot be undone, and it will disappear from
					the live site immediately.
				</p>
			</div>
		</div>

		<form
			id="delete-form"
			method="POST"
			action="?/remove"
			class="mt-6"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					deleting = null;
					await invalidateAll();
				}}
		>
			<input type="hidden" name="id" value={deleting.id ?? ''} />
		</form>
	{/if}

	{#snippet footer()}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<button
				type="button"
				onclick={() => (deleting = null)}
				class="clip-corner border border-outline/50 px-6 py-3 font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase hover:bg-white/5 sm:w-40"
			>
				Cancel
			</button>
			<div class="flex-1">
				<!-- Keyed on the target row: the footer snippet stays mounted across
				     open/close cycles, and HoldButton latches `fired` after confirming
				     (deliberately — it is what blocks a double submit). Re-mounting per
				     target is what arms it again for the next delete. -->
				{#key deleting}
					<HoldButton
						label="Hold to delete"
						confirmLabel="Keep holding…"
						doneLabel="Deleting…"
						duration={1400}
						onconfirm={() =>
							(document.getElementById('delete-form') as HTMLFormElement)?.requestSubmit()}
					/>
				{/key}
			</div>
		</div>
	{/snippet}
</Modal>
