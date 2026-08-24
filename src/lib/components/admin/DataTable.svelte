<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import Switch from './Switch.svelte';
	import type { Field } from '$lib/adminSchema';

	type Row = Record<string, unknown> & { id?: string };

	let {
		columns,
		rows,
		sort,
		dir,
		onedit,
		ondelete
	}: {
		columns: Field[];
		rows: Row[];
		sort: string;
		dir: 'asc' | 'desc';
		onedit: (row: Row) => void;
		ondelete: (row: Row) => void;
	} = $props();

	// Sorting is a link, not a click handler: it round-trips through the URL so
	// the server sorts, and the state survives refresh and the back button.
	function sortHref(field: string): string {
		const params = new URLSearchParams(pageState.url.searchParams);
		const nextDir = sort === field && dir === 'asc' ? 'desc' : 'asc';
		params.set('sort', field);
		params.set('dir', nextDir);
		params.delete('page'); // a new sort order invalidates the current page
		return `?${params}`;
	}

	function display(row: Row, f: Field): string {
		const v = row[f.name];
		if (v === undefined || v === null || v === '') return '—';
		if (f.type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
		// A translatable field is stored as { en, es }. String() on that yields
		// "[object Object]" — show the English value (or whichever exists).
		if (typeof v === 'object') {
			const l = v as { en?: string; es?: string };
			return l.en || l.es || '—';
		}
		return String(v);
	}
</script>

<div class="glass chamfer-tr overflow-x-auto">
	<table class="w-full min-w-[560px] border-collapse text-left">
		<thead>
			<tr class="border-b border-white/10">
				{#each columns as c (c.name)}
					{@const active = sort === c.name}
					<th
						scope="col"
						class="px-4 py-3"
						aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
					>
						<a
							href={sortHref(c.name)}
							class="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors {active
								? 'text-primary-container'
								: 'text-outline hover:text-primary-container'}"
						>
							{c.label}
							<span aria-hidden="true" class="text-[10px]">
								{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
							</span>
						</a>
					</th>
				{/each}
				<th scope="col" class="px-4 py-3">
					<span class="sr-only">Actions</span>
				</th>
			</tr>
		</thead>

		<tbody>
			{#each rows as row (row.id)}
				<tr class="border-b border-white/5 transition-colors hover:bg-primary-container/5">
					{#each columns as c (c.name)}
						<td class="px-4 py-3 text-sm text-on-surface-variant">
							{#if c.type === 'boolean'}
								{@const on = row[c.name] !== false}
								<span class="font-mono text-xs {on ? 'text-tertiary-container' : 'text-outline'}">
									{on ? 'yes' : 'no'}
								</span>
							{:else}
								<span class="line-clamp-2">{display(row, c)}</span>
							{/if}
						</td>
					{/each}
					<td class="px-4 py-3 text-right whitespace-nowrap">
						<!-- Visibility first, and always present: it is the one action
						     wanted at a glance, and it does not depend on the schema
						     happening to list isActive as a column. -->
						<form
							method="POST"
							action="?/toggle"
							class="mr-4 inline-flex items-center align-middle"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
									await invalidateAll();
								}}
						>
							<input type="hidden" name="id" value={row.id} />
							<input type="hidden" name="field" value="isActive" />
							<input type="hidden" name="next" value={String(row.isActive === false)} />
							<Switch
								checked={row.isActive !== false}
								label={row.isActive !== false ? 'Hide record' : 'Show record'}
							/>
						</form>
						<button
							type="button"
							onclick={() => onedit(row)}
							class="font-mono text-xs tracking-[0.1em] text-primary-container uppercase hover:underline"
						>
							Edit
						</button>
						<button
							type="button"
							onclick={() => ondelete(row)}
							class="ml-3 font-mono text-xs tracking-[0.1em] text-error uppercase hover:underline"
						>
							Delete
						</button>
					</td>
				</tr>
			{:else}
				<tr>
					<td
						colspan={columns.length + 1}
						class="px-4 py-10 text-center font-mono text-xs text-outline"
					>
						Nothing here yet.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
