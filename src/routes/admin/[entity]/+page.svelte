<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Row = Record<string, unknown> & { id?: string };

	let editing = $state<Row | null>(null);
	let saving = $state(false);
	let bodyEl = $state<HTMLTextAreaElement | null>(null);

	const columns = $derived(data.schema.fields.filter((f) => f.column));
	const titleOf = (row: Row) => String(row[data.schema.titleField] ?? '(untitled)');

	function startNew() {
		editing = { isActive: true };
	}

	function valueFor(row: Row | null, name: string, type: string): string {
		const v = row?.[name];
		if (v === undefined || v === null) return '';
		if (type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
		return String(v);
	}

	/** Wrap or insert markdown around the current selection. */
	function surround(before: string, after = before, placeholder = 'text') {
		const el = bodyEl;
		if (!el) return;
		const { selectionStart: s, selectionEnd: e, value } = el;
		const selected = value.slice(s, e) || placeholder;
		const next = value.slice(0, s) + before + selected + after + value.slice(e);
		el.value = next;
		el.focus();
		el.setSelectionRange(s + before.length, s + before.length + selected.length);
	}

	const tools = [
		{ label: 'H2', run: () => surround('\n## ', '\n', 'Heading') },
		{ label: 'H3', run: () => surround('\n### ', '\n', 'Heading') },
		{ label: 'B', run: () => surround('**', '**', 'bold') },
		{ label: 'I', run: () => surround('_', '_', 'italic') },
		{ label: 'Link', run: () => surround('[', '](https://)', 'label') },
		{ label: 'Image', run: () => surround('![', '](/images/example.png)', 'alt') },
		{ label: 'Code', run: () => surround('\n```\n', '\n```\n', 'code') },
		{ label: 'Quote', run: () => surround('\n> ', '\n', 'quote') },
		{ label: 'List', run: () => surround('\n- ', '\n', 'item') }
	];
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
			onclick={startNew}
			class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed"
		>
			+ New
		</button>
	</div>

	{#if form?.message}
		<p
			class="mb-4 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<!-- ============ list ============ -->
	<div class="glass chamfer-tr mb-8 overflow-x-auto">
		<table class="w-full min-w-[520px] border-collapse text-left">
			<thead>
				<tr class="border-b border-white/10">
					{#each columns as c (c.name)}
						<th
							class="px-4 py-3 font-mono text-xs tracking-[0.1em] text-primary-container uppercase"
						>
							{c.label}
						</th>
					{/each}
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.items as row (row.id)}
					<tr class="border-b border-white/5 transition-colors hover:bg-primary-container/5">
						{#each columns as c (c.name)}
							<td class="px-4 py-3 text-sm text-on-surface-variant">
								{#if c.type === 'boolean'}
									{@const hidden = (row as Row)[c.name] === false}
									<span class={hidden ? 'text-outline' : 'text-tertiary-container'}>
										{hidden ? 'hidden' : 'visible'}
									</span>
								{:else}
									{valueFor(row as Row, c.name, c.type) || '—'}
								{/if}
							</td>
						{/each}
						<td class="px-4 py-3 text-right whitespace-nowrap">
							<button
								type="button"
								onclick={() => (editing = row as Row)}
								class="font-mono text-xs tracking-[0.1em] text-primary-container uppercase hover:underline"
							>
								Edit
							</button>
							<form
								method="POST"
								action="?/remove"
								class="ml-3 inline"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										await invalidateAll();
									}}
							>
								<input type="hidden" name="id" value={row.id} />
								<button
									type="submit"
									class="font-mono text-xs tracking-[0.1em] text-error uppercase hover:underline"
									onclick={(e) => {
										if (!confirm(`Delete "${titleOf(row as Row)}"? This cannot be undone.`))
											e.preventDefault();
									}}
								>
									Delete
								</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr>
						<td
							colspan={columns.length + 1}
							class="px-4 py-8 text-center font-mono text-xs text-outline"
						>
							Nothing here yet.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- ============ editor ============ -->
	{#if editing}
		<div class="glass chamfer-tr p-6">
			<h2 class="m-0 mb-5 font-mono text-sm tracking-[0.12em] text-secondary uppercase">
				{editing.id ? `Edit — ${titleOf(editing)}` : 'New record'}
			</h2>

			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ update, result }) => {
						await update({ reset: false });
						saving = false;
						if (result.type === 'success') {
							editing = null;
							await invalidateAll();
						}
					};
				}}
				class="flex flex-col gap-5"
			>
				{#if editing.id}<input type="hidden" name="id" value={editing.id} />{/if}

				{#each data.schema.fields as field (field.name)}
					<div class="flex flex-col gap-2">
						<label
							class="font-mono text-xs tracking-[0.1em] text-outline uppercase"
							for={field.name}
						>
							{field.label}{#if field.required}<span class="text-error"> *</span>{/if}
						</label>

						{#if field.type === 'boolean'}
							<input
								id={field.name}
								name={field.name}
								type="checkbox"
								checked={editing[field.name] !== false}
								class="h-5 w-5 accent-[#00f3ff]"
							/>
						{:else if field.type === 'select'}
							<select
								id={field.name}
								name={field.name}
								value={valueFor(editing, field.name, field.type) || field.options?.[0]}
								class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
							>
								{#each field.options ?? [] as opt (opt)}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						{:else if field.type === 'markdown'}
							<div class="flex flex-wrap gap-1.5 pb-1">
								{#each tools as t (t.label)}
									<button
										type="button"
										onclick={t.run}
										class="border border-outline/40 px-2.5 py-1 font-mono text-xs text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container"
									>
										{t.label}
									</button>
								{/each}
								{#if editing.slug}
									<!--
										Preview reuses the real page: drafts render at /blog/<slug>
										for a signed-in admin. One renderer, one sanitiser — a second
										client-side preview pipeline would drift from the server's.
									-->
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
							<textarea
								bind:this={bodyEl}
								id={field.name}
								name={field.name}
								rows="18"
								value={valueFor(editing, field.name, field.type)}
								class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm leading-relaxed text-on-surface outline-none focus:border-primary-container"
							></textarea>
						{:else if field.type === 'textarea'}
							<textarea
								id={field.name}
								name={field.name}
								rows="3"
								value={valueFor(editing, field.name, field.type)}
								class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container"
							></textarea>
						{:else}
							<input
								id={field.name}
								name={field.name}
								type={field.type === 'number' ? 'number' : 'text'}
								value={valueFor(editing, field.name, field.type)}
								class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none focus:border-primary-container"
							/>
						{/if}

						{#if field.help}
							<span class="font-mono text-xs text-outline">{field.help}</span>
						{/if}
					</div>
				{/each}

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving}
						class="clip-corner bg-primary-container px-6 py-3 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
					<button
						type="button"
						onclick={() => (editing = null)}
						class="clip-corner border border-outline/50 px-6 py-3 font-mono text-xs tracking-[0.1em] text-on-surface-variant uppercase hover:bg-white/5"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>
