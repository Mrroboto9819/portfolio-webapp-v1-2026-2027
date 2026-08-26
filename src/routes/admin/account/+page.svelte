<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { LOCALE_NAME, ui, type Locale } from '$lib/i18n';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	// The radio group edits a copy; the form submits the choice.
	let chosen = $state<string>('');
	$effect(() => {
		chosen = data.savedLocale ?? data.locale ?? 'en';
	});

	let busy = $state(false);

	const tier = $derived(data.session?.isSuperAdmin ? T('admin.superAdmin') : T('admin.musicAdmin'));

	const field =
		'w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary-container';
	const label = 'font-mono text-xs tracking-[0.1em] text-outline uppercase';
</script>

<svelte:head>
	<title>Admin — {T('admin.account')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-6 md:p-10">
	<h1 class="m-0 mb-6 text-2xl font-bold tracking-[-0.02em] text-on-surface uppercase">
		{T('admin.account')}
	</h1>

	<div class="flex max-w-xl flex-col gap-8">
		<!-- identity -->
		<section class="glass border border-white/10 p-5">
			<div class="mb-1 font-mono text-xs tracking-[0.14em] text-secondary uppercase">
				// {T('admin.signedInAs')}
			</div>
			<div class="font-mono text-lg text-on-surface">{data.session?.username ?? ''}</div>
			<div class="mt-2 flex items-baseline gap-2">
				<span class={label}>{T('admin.accessLevel')}</span>
				<span
					class="font-mono text-xs tracking-[0.08em] uppercase {data.session?.isSuperAdmin
						? 'text-primary-container'
						: 'text-tertiary-container'}"
				>
					{tier}
				</span>
			</div>
		</section>

		<!-- language -->
		<section class="glass border border-white/10 p-5">
			<h2 class="m-0 mb-1 font-mono text-sm tracking-[0.1em] text-on-surface uppercase">
				{T('admin.language')}
			</h2>
			<p class="mt-0 mb-4 font-mono text-[11px] leading-snug text-outline">
				{T('admin.languageHelp')}
			</p>

			<form
				method="POST"
				action="?/language"
				use:enhance={() => {
					busy = true;
					return async ({ result }) => {
						busy = false;
						if (result.type === 'success') {
							toast.success(T('admin.saved'));
							// The locale changed, so every string on screen must be
							// re-resolved — including this page's own.
							await invalidateAll();
						} else if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Could not save'));
						}
					};
				}}
				class="flex flex-col gap-3"
			>
				{#each data.locales as loc (loc)}
					<label class="flex cursor-pointer items-center gap-3">
						<input
							type="radio"
							name="locale"
							value={loc}
							bind:group={chosen}
							class="accent-[#00f3ff]"
						/>
						<span class="font-mono text-sm text-on-surface">{LOCALE_NAME[loc]}</span>
					</label>
				{/each}

				<button
					type="submit"
					disabled={busy}
					class="clip-corner mt-2 self-start bg-primary-container px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-surface uppercase hover:bg-primary-fixed disabled:opacity-50"
				>
					{T('admin.save')}
				</button>
			</form>
		</section>

		<!-- password -->
		<section class="glass border border-white/10 p-5">
			<h2 class="m-0 mb-4 font-mono text-sm tracking-[0.1em] text-on-surface uppercase">
				{T('admin.changePassword')}
			</h2>

			<form
				method="POST"
				action="?/password"
				use:enhance={() => {
					busy = true;
					return async ({ result }) => {
						busy = false;
						if (result.type === 'success') {
							// Every session was revoked, this one included, so say what
							// happens next rather than leaving them on a dead page.
							toast.success(`${T('admin.passwordChanged')} — signing in again…`);
							setTimeout(() => location.assign('/admin/login'), 1200);
						} else if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Could not change password'));
						}
					};
				}}
				class="flex flex-col gap-4"
			>
				<div class="flex flex-col gap-2">
					<label class={label} for="current">{T('admin.currentPassword')}</label>
					<input
						id="current"
						name="current"
						type="password"
						required
						autocomplete="current-password"
						class="{field} font-mono"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label class={label} for="next">{T('admin.newPassword')}</label>
					<input
						id="next"
						name="next"
						type="password"
						required
						minlength="10"
						autocomplete="new-password"
						class="{field} font-mono"
					/>
				</div>
				<p class="m-0 font-mono text-[11px] leading-snug text-outline">
					You will be signed out and asked to sign in with the new password.
				</p>
				<button
					type="submit"
					disabled={busy}
					class="clip-corner self-start border border-primary-container/60 bg-primary-container/10 px-5 py-2.5 font-mono text-xs font-bold tracking-[0.1em] text-primary-container uppercase hover:bg-primary-container/20 disabled:opacity-50"
				>
					{T('admin.changePassword')}
				</button>
			</form>
		</section>
	</div>
</div>
