<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/admin/Modal.svelte';
	import HoldButton from '$lib/components/admin/HoldButton.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	type Row = PageData['users'][number];

	let creating = $state(false);
	let resetting = $state<Row | null>(null);
	let editing = $state<Row | null>(null);
	let deleting = $state<Row | null>(null);
	let busy = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);

	// The flag switches are bound, so the modal edits a copy and the form
	// submits the intended end state — not a diff the server has to reconstruct.
	let draftAdmin = $state(false);
	let draftSuper = $state(false);

	function openFlags(u: Row) {
		editing = u;
		draftAdmin = u.isAdmin;
		draftSuper = u.isSuperAdmin;
	}

	const self = $derived(data.session?.sub ?? '');
	const superCount = $derived(data.users.filter((u) => u.isSuperAdmin).length);
	const lastSuper = (u: Row) => u.isSuperAdmin && superCount <= 1;

	const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10) : '—');
	const tierOf = (u: Row) =>
		u.isSuperAdmin ? T('admin.superAdmin') : u.isAdmin ? T('admin.musicAdmin') : T('admin.dormant');

	// One enhance handler shape for every action: toast, close, refresh.
	function handle(success: string) {
		busy = true;
		return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
			busy = false;
			if (result.type === 'success') {
				toast.success(success);
				creating = false;
				resetting = null;
				editing = null;
				deleting = null;
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'That did not work'));
				// A refused delete closes its modal too: the HoldButton has already
				// fired and sits spent, so leaving it open offers a dead control.
				deleting = null;
			}
		};
	}

	const field =
		'w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';
	const label = 'font-mono text-xs tracking-[0.1em] text-outline uppercase';
</script>

<svelte:head>
	<title>Admin — {T('admin.users')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<h1 class="m-0 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">
			{T('admin.users')}
		</h1>
		<button
			type="button"
			onclick={() => (creating = true)}
			class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed"
		>
			+ New user
		</button>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="border-b border-white/10 text-left">
					<th class="px-3 py-2.5 {label}">{T('admin.username')}</th>
					<th class="px-3 py-2.5 {label}">{T('admin.email')}</th>
					<th class="px-3 py-2.5 {label}">{T('admin.accessLevel')}</th>
					<th class="px-3 py-2.5 {label}">{T('admin.created')}</th>
					<th class="px-3 py-2.5 text-right {label}">{T('admin.actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr class="border-b border-white/5">
						<td class="px-3 py-3 font-mono text-sm text-on-surface">
							{u.username}
							{#if u.id === self}
								<span
									class="ml-2 border border-primary-container/40 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-primary-container uppercase"
								>
									You
								</span>
							{/if}
						</td>
						<td class="px-3 py-3 font-mono text-xs text-outline">
							{u.email ?? (u.username.includes('@') ? u.username : '—')}
						</td>
						<td class="px-3 py-3">
							<span
								class="font-mono text-xs tracking-[0.08em] uppercase {u.isSuperAdmin
									? 'text-primary-container'
									: u.isAdmin
										? 'text-tertiary-container'
										: 'text-outline'}"
							>
								{tierOf(u)}
							</span>
							{#if !u.isAdmin && !u.isSuperAdmin}
								<span class="ml-2 font-mono text-[10px] text-outline"
									>{T('admin.cannotSignIn')}</span
								>
							{/if}
						</td>
						<td class="px-3 py-3 font-mono text-xs text-outline">{fmtDate(u.createdAt)}</td>
						<td class="px-3 py-3">
							<div class="flex justify-end gap-2">
								<button
									type="button"
									onclick={() => openFlags(u)}
									disabled={u.id === self}
									title={u.id === self ? 'Change your own flags in the database' : ''}
									class="border border-outline/40 px-3 py-1.5 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container disabled:cursor-not-allowed disabled:opacity-30"
								>
									Access
								</button>
								<button
									type="button"
									onclick={() => (resetting = u)}
									class="border border-outline/40 px-3 py-1.5 font-mono text-xs uppercase hover:border-primary-container hover:text-primary-container"
								>
									Password
								</button>
								<button
									type="button"
									onclick={() => (deleting = u)}
									disabled={u.id === self || lastSuper(u)}
									title={u.id === self
										? 'You cannot delete the account you are signed in with'
										: lastSuper(u)
											? 'Cannot delete the last super-admin'
											: ''}
									class="border border-error/50 px-3 py-1.5 font-mono text-xs text-error uppercase hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-30"
								>
									Delete
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-6 font-mono text-[11px] leading-snug text-outline">
		New users are created as music admins: YouTube search, grabbing and the playlist, nothing else.
		A super-admin sees the whole panel. An account with neither flag keeps its password but cannot
		sign in. Changing access or a password ends that user's open sessions.
	</p>
</div>

<!-- ============ create ============ -->
<Modal open={creating} onclose={() => (creating = false)} title="New admin user">
	<form
		method="POST"
		action="?/create"
		use:enhance={() => handle('User created')}
		class="flex flex-col gap-5"
	>
		<div class="flex flex-col gap-2">
			<label class={label} for="new-username">Username <span class="text-error">*</span></label>
			<input
				id="new-username"
				name="username"
				required
				autocomplete="off"
				placeholder="3–32 chars: letters, digits, . _ -"
				class="{field} font-mono"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<label class={label} for="new-password">Password <span class="text-error">*</span></label>
			<input
				id="new-password"
				name="password"
				type="password"
				required
				minlength="10"
				autocomplete="new-password"
				placeholder="At least 10 characters"
				class="{field} font-mono"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<label class={label} for="new-email">{T('admin.email')}</label>
			<input
				id="new-email"
				name="email"
				type="email"
				autocomplete="off"
				placeholder="optional"
				class="{field} font-mono"
			/>
			<p class="m-0 font-mono text-[11px] leading-snug text-outline">{T('admin.emailHelp')}</p>
		</div>
		<p class="m-0 font-mono text-[11px] leading-snug text-outline">
			Created as a music admin. Promote them afterwards from Access if they need the rest.
		</p>
		<button
			type="submit"
			disabled={busy}
			class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
		>
			{busy ? 'Creating…' : 'Create user'}
		</button>
	</form>
</Modal>

<!-- ============ access flags ============ -->
<Modal
	open={editing !== null}
	onclose={() => (editing = null)}
	title={`Access — ${editing?.username ?? ''}`}
>
	{#if editing}
		<form
			method="POST"
			action="?/flags"
			use:enhance={() => handle('Access updated')}
			class="flex flex-col gap-5"
		>
			<input type="hidden" name="id" value={editing.id} />

			<div class="flex flex-col gap-2">
				<label class={label} for="edit-email">{T('admin.email')}</label>
				<input
					id="edit-email"
					name="email"
					type="email"
					autocomplete="off"
					value={editing.email ?? ''}
					placeholder="optional"
					class="{field} font-mono"
				/>
				<p class="m-0 font-mono text-[11px] leading-snug text-outline">{T('admin.emailHelp')}</p>
			</div>

			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="min-w-0">
					<span class="block {label}">Music admin</span>
					<span class="mt-1 block font-mono text-[11px] leading-snug text-outline">
						YouTube search, grabbing tracks, the playlist and the songs collection.
					</span>
				</span>
				<input
					type="checkbox"
					name="isAdmin"
					class="cyber-switch mt-0.5 shrink-0"
					bind:checked={draftAdmin}
				/>
			</label>

			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="min-w-0">
					<span class="block {label}">Super-admin</span>
					<span class="mt-1 block font-mono text-[11px] leading-snug text-outline">
						The whole panel: every collection, uploads, the export and this page.
					</span>
				</span>
				<input
					type="checkbox"
					name="isSuperAdmin"
					class="cyber-switch mt-0.5 shrink-0"
					bind:checked={draftSuper}
				/>
			</label>

			{#if !draftAdmin && !draftSuper}
				<p
					class="m-0 border border-error/40 bg-error/10 px-3 py-2 font-mono text-[11px] text-error"
				>
					With neither flag this account keeps its password but cannot sign in.
				</p>
			{/if}

			<button
				type="submit"
				disabled={busy}
				class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
			>
				{busy ? 'Saving…' : 'Save access'}
			</button>
		</form>
	{/if}
</Modal>

<!-- ============ reset password ============ -->
<Modal
	open={resetting !== null}
	onclose={() => (resetting = null)}
	title={`Password — ${resetting?.username ?? ''}`}
>
	{#if resetting}
		<form
			method="POST"
			action="?/password"
			use:enhance={() => handle('Password updated')}
			class="flex flex-col gap-5"
		>
			<input type="hidden" name="id" value={resetting.id} />
			<div class="flex flex-col gap-2">
				<label class={label} for="reset-password">
					New password <span class="text-error">*</span>
				</label>
				<input
					id="reset-password"
					name="password"
					type="password"
					required
					minlength="10"
					autocomplete="new-password"
					placeholder="At least 10 characters"
					class="{field} font-mono"
				/>
				<p class="m-0 font-mono text-[11px] text-outline">
					Their open sessions end — they sign in again with the new password.
				</p>
			</div>
			<button
				type="submit"
				disabled={busy}
				class="clip-corner bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
			>
				{busy ? 'Saving…' : 'Set password'}
			</button>
		</form>
	{/if}
</Modal>

<!-- ============ delete ============ -->
<Modal
	open={deleting !== null}
	onclose={() => (deleting = null)}
	title={`Delete — ${deleting?.username ?? ''}`}
>
	{#if deleting}
		<p class="mt-0 mb-5 font-mono text-xs leading-relaxed text-on-surface-variant">
			Removes the account and ends its sessions. Tracks they grabbed stay in the library — only the
			user goes. To keep them out without deleting, turn both access flags off instead.
		</p>
		<form
			bind:this={deleteForm}
			method="POST"
			action="?/remove"
			use:enhance={() => handle('User deleted')}
		>
			<input type="hidden" name="id" value={deleting.id} />
			<!-- Keyed on the target: HoldButton latches `fired` after confirming
			     (that is what blocks a double submit), so it must be re-mounted to
			     arm again for the next user. -->
			{#key deleting}
				<HoldButton
					label="Hold to delete"
					confirmLabel="Keep holding…"
					doneLabel="Deleting…"
					duration={1400}
					onconfirm={() => deleteForm?.requestSubmit()}
				/>
			{/key}
		</form>
	{/if}
</Modal>
