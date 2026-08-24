<script lang="ts">
	import { page } from '$app/state';
	import { ENTITY_ORDER, SCHEMAS } from '$lib/adminSchema';
	import Toaster from '$lib/components/Toaster.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const isLogin = $derived(page.url.pathname === '/admin/login');
</script>

<Toaster />

{#if isLogin}
	{@render children()}
{:else}
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
							{data.session?.role ?? ''}
						</div>
					</div>
				</div>
			</div>

			<nav class="flex flex-col py-3">
				<a
					href="/admin"
					class="border-l-2 px-5 py-2.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors"
					class:border-secondary-container={page.url.pathname === '/admin'}
					class:text-secondary-container={page.url.pathname === '/admin'}
					class:border-transparent={page.url.pathname !== '/admin'}
					class:text-outline={page.url.pathname !== '/admin'}
				>
					Overview
				</a>
				<a
					href="/admin/profile"
					class="border-l-2 px-5 py-2.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors hover:text-primary-container"
					class:border-secondary-container={page.url.pathname === '/admin/profile'}
					class:text-secondary-container={page.url.pathname === '/admin/profile'}
					class:border-transparent={page.url.pathname !== '/admin/profile'}
					class:text-outline={page.url.pathname !== '/admin/profile'}
				>
					Profile
				</a>
				{#each ENTITY_ORDER as name (name)}
					{@const activeRow = page.url.pathname === `/admin/${name}`}
					<a
						href="/admin/{name}"
						class="border-l-2 px-5 py-2.5 font-mono text-xs tracking-[0.1em] uppercase transition-colors hover:text-primary-container"
						class:border-secondary-container={activeRow}
						class:text-secondary-container={activeRow}
						class:border-transparent={!activeRow}
						class:text-outline={!activeRow}
					>
						{SCHEMAS[name].label}
					</a>
				{/each}
			</nav>

			<div class="mt-auto border-t border-white/10 p-4">
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
			</div>
		</aside>

		<div class="min-w-0 flex-1">
			<!-- mobile bar -->
			<div class="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
				<a href="/admin" class="font-mono text-xs tracking-[0.14em] text-secondary uppercase">
					// ADMIN
				</a>
				<form method="POST" action="/admin/logout">
					<button type="submit" class="font-mono text-xs text-error uppercase">Sign out</button>
				</form>
			</div>

			{@render children()}
		</div>
	</div>
{/if}
