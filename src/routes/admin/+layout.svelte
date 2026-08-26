<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ENTITY_ORDER, SCHEMAS } from '$lib/adminSchema';
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import NowPlaying from '$lib/components/admin/NowPlaying.svelte';
	import { effects } from '$lib/effects.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Pages reachable while signed OUT render bare — no rail, no transport.
	// They are how you get in, so surrounding them with the chrome of a session
	// that does not exist is both wrong and confusing: the rail was showing a
	// previous user's name behind the recovery form.
	const BARE_PATHS = ['/admin/login', '/admin/recover'];
	const isBare = $derived(BARE_PATHS.includes(page.url.pathname));
	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	// Presentation only — hooks.server.ts is what actually refuses a music admin
	// the super-admin routes and their endpoints. Hiding the links keeps the rail
	// honest about what this session can do; it is not the access control.
	const isSuper = $derived(data.session?.isSuperAdmin === true);

	const active = (href: string) => page.url.pathname === href;

	// The rail is hidden below md, which used to leave the admin with NO
	// navigation at all on a phone — only a sign-out button. Same links, same
	// order, in a drawer behind a button.
	let navOpen = $state(false);

	// Rows every role sees, in rail order.
	const shared = $derived([
		{ href: '/admin/youtube', label: T('admin.youtube') },
		{ href: '/admin/playlist', label: T('admin.playlist') },
		{ href: '/admin/account', label: T('admin.account') }
	]);

	const rowClass =
		'border-l-2 px-5 py-2.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors hover:text-primary-container';

	// The stored on/off choice is read once here. Without this the admin renders
	// the atmosphere at full strength for someone who turned it off on the
	// public site — one preference, both halves of the app.
	onMount(() => effects.init());
</script>

{#snippet navRows()}
	{#if isSuper}
		{#each [{ href: '/admin', label: 'Overview' }, { href: '/admin/data', label: 'Data' }, { href: '/admin/users', label: T('admin.users') }, { href: '/admin/profile', label: 'Site profile' }] as link (link.href)}
			<a
				href={link.href}
				onclick={() => (navOpen = false)}
				class={rowClass}
				class:border-secondary-container={active(link.href)}
				class:text-secondary-container={active(link.href)}
				class:border-transparent={!active(link.href)}
				class:text-outline={!active(link.href)}
			>
				{link.label}
			</a>
		{/each}
	{/if}

	<!-- Music + account: what a music admin sees, and for them the top of the
	     rail since nothing precedes it. -->
	{#each shared as link (link.href)}
		<a
			href={link.href}
			onclick={() => (navOpen = false)}
			class={rowClass}
			class:border-secondary-container={active(link.href)}
			class:text-secondary-container={active(link.href)}
			class:border-transparent={!active(link.href)}
			class:text-outline={!active(link.href)}
		>
			{link.label}
		</a>
	{/each}

	{#if isSuper}
		{#each ENTITY_ORDER as name (name)}
			{@const activeRow = active(`/admin/${name}`)}
			<a
				href="/admin/{name}"
				onclick={() => (navOpen = false)}
				class={rowClass}
				class:border-secondary-container={activeRow}
				class:text-secondary-container={activeRow}
				class:border-transparent={!activeRow}
				class:text-outline={!activeRow}
			>
				{SCHEMAS[name].label}
			</a>
		{/each}
	{/if}
	<!-- No Music row for a music admin: the raw collection editor is where the
	     site's music is SET, which is a super-admin job. They work through the
	     playlist and the grab screen. -->
{/snippet}

{#snippet railFooter()}
	<!-- The same visual-effects switch the public drawer carries. The admin runs
	     on the same grid, scanlines and glitch, and someone editing a table for
	     an hour is exactly who wants them off. -->
	<label class="mb-3 flex cursor-pointer items-center justify-between gap-3">
		<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">
			{effects.enabled ? 'Hide effects' : 'Show effects'}
		</span>
		<input
			type="checkbox"
			class="cyber-switch"
			checked={effects.enabled}
			onchange={() => effects.toggle()}
			aria-label="Toggle visual effects"
		/>
	</label>

	<a
		href="/"
		class="mb-2 block py-2 text-center font-mono text-xs tracking-[0.1em] text-outline uppercase hover:text-primary-container"
	>
		View site
	</a>
	<form method="POST" action="/admin/logout">
		<button
			type="submit"
			class="w-full border border-error/50 py-2.5 font-mono text-xs tracking-[0.12em] text-error uppercase transition-colors hover:bg-error/10"
		>
			Sign out
		</button>
	</form>
{/snippet}

<Toaster />

{#if isBare}
	<!-- These pages mount their own Atmosphere; mounting a second set here
	     would double every layer's opacity. -->
	{@render children()}
{:else}
	<!-- Same four background layers as the public site, behind the same
	     preference switch. -->
	<Atmosphere />

	<div class="flex min-h-dvh bg-surface">
		<!-- left rail, mirroring the reference drawer -->
		<aside
			class="glass sticky top-0 hidden h-dvh w-60 shrink-0 flex-col md:flex"
			style="border-right: 1px solid rgba(0,220,230,0.28)"
		>
			<div class="border-b border-white/10 px-5 py-4">
				<div class="mb-3 font-mono text-xs tracking-[0.14em] text-secondary uppercase">
					// ADMIN
				</div>
				<div class="flex items-center gap-3">
					{#if data.profile?.avatar}
						<img
							src={data.profile.avatar}
							alt=""
							class="h-9 w-9 shrink-0 border border-primary-container/40 object-cover"
							loading="lazy"
						/>
					{/if}
					<div class="min-w-0">
						<div
							class="truncate font-mono text-xs text-on-surface"
							title={data.session?.username ?? ''}
						>
							{data.profile?.displayName ?? data.session?.username ?? ''}
						</div>
						<div class="mt-0.5 font-mono text-xs text-tertiary-container">
							{isSuper ? T('admin.superAdmin') : T('admin.musicAdmin')}
						</div>
					</div>
				</div>
			</div>

			<nav class="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
				{@render navRows()}
			</nav>

			<div class="mt-auto border-t border-white/10 p-4">
				{@render railFooter()}
			</div>
		</aside>

		<div class="min-w-0 flex-1">
			<!-- mobile bar -->
			<div class="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
				<button
					type="button"
					onclick={() => (navOpen = true)}
					aria-label="Open admin menu"
					aria-expanded={navOpen}
					class="flex items-center gap-2 font-mono text-xs tracking-[0.14em] text-secondary uppercase"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M4 7h16M4 12h16M4 17h16" />
					</svg>
					// ADMIN
				</button>
				<form method="POST" action="/admin/logout">
					<button type="submit" class="font-mono text-xs text-error uppercase">Sign out</button>
				</form>
			</div>

			<!-- Room for the transport pinned at the bottom, so the last row of a
			     long table is never sitting underneath it. -->
			<div class="pb-24">
				{@render children()}
			</div>
		</div>
	</div>

	<!-- mobile drawer -->
	{#if navOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[60] bg-surface-lowest/85 backdrop-blur-[2px] md:hidden"
			onclick={() => (navOpen = false)}
			aria-hidden="true"
		></div>
		<div
			class="glass fixed top-0 bottom-0 left-0 z-[61] flex w-[min(80vw,260px)] flex-col md:hidden"
			style="border-right: 1px solid rgba(0,220,230,0.35)"
			role="dialog"
			aria-modal="true"
			aria-label="Admin navigation"
		>
			<div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
				<div class="min-w-0">
					<div class="font-mono text-xs tracking-[0.14em] text-secondary uppercase">// ADMIN</div>
					<div class="mt-1 truncate font-mono text-xs text-on-surface">
						{data.session?.username ?? ''}
					</div>
				</div>
				<button
					type="button"
					onclick={() => (navOpen = false)}
					aria-label="Close admin menu"
					class="flex h-8 w-8 shrink-0 items-center justify-center border border-primary-container/40 text-primary-container"
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
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>

			<nav class="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
				{@render navRows()}
			</nav>

			<div class="border-t border-white/10 p-4">
				{@render railFooter()}
			</div>
		</div>
	{/if}

	<NowPlaying songs={data.songs} />
{/if}
