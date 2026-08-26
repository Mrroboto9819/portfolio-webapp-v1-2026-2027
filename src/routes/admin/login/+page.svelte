<script lang="ts">
	import { enhance } from '$app/forms';
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Reveal is per-visit only and never persisted: a remembered "show my
	// password" would expose it on a shared screen the next time round.
	let showPassword = $state(false);
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Admin — Pablo Cabrera</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="crt" aria-hidden="true"></div>
<Atmosphere />

<main class="relative z-10 flex min-h-dvh items-center justify-center px-margin-mobile">
	<HudPanel chamfer="corner" class="hud-corners relative w-full max-w-sm p-8">
		<div class="mb-6 flex items-center gap-2.5">
			<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-container"></span>
			<span class="font-mono text-xs tracking-[0.1em] text-secondary uppercase"
				>// ADMIN_MODULE</span
			>
		</div>

		<h1
			class="glow-hero m-0 mb-5 text-2xl font-extrabold tracking-[-0.03em] text-primary uppercase"
		>
			Access Point
		</h1>

		<div class="rule mb-6"></div>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="flex flex-col gap-4"
		>
			<label class="flex flex-col gap-2">
				<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Operator</span>
				<input
					name="username"
					autocomplete="username"
					required
					value={form?.username ?? ''}
					class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
				/>
			</label>

			<label class="flex flex-col gap-2">
				<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">Passphrase</span>
				<div class="relative">
					<input
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						required
						class="w-full border border-outline/40 bg-surface-lowest/60 py-2.5 pr-11 pl-3 font-mono text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
					/>
					<!-- tabindex -1: the reveal is a convenience, and putting it in the
					     tab order between the field and Sign in makes the keyboard path
					     to submitting longer for everyone. -->
					<button
						type="button"
						tabindex="-1"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Hide passphrase' : 'Show passphrase'}
						aria-pressed={showPassword}
						class="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-outline transition-colors hover:text-primary-container"
					>
						{#if showPassword}
							<!-- eye with a slash: currently visible, click to hide -->
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								aria-hidden="true"
							>
								<path
									d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.2M6.2 6.6C3.9 8.1 3 10.3 3 12c0 2.5 4 7 9 7a9.7 9.7 0 003.6-.7"
								/>
							</svg>
						{:else}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								aria-hidden="true"
							>
								<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
			</label>

			{#if form?.message}
				<p
					class="m-0 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
					role="alert"
				>
					{form.message}
				</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="clip-corner mt-1 bg-primary-container py-3 font-mono text-xs font-bold tracking-[0.12em] text-surface uppercase transition-colors hover:bg-primary-fixed disabled:opacity-50"
			>
				{submitting ? 'Verifying…' : 'Authenticate'}
			</button>
		</form>

		<div class="mt-6 flex flex-wrap items-center justify-between gap-3">
			<a
				href="/"
				class="inline-block font-mono text-xs tracking-[0.1em] text-outline uppercase transition-colors hover:text-primary-container"
			>
				&larr; Return to site
			</a>
			<a
				href="/admin/recover"
				class="inline-block font-mono text-xs tracking-[0.1em] text-outline uppercase transition-colors hover:text-primary-container"
			>
				{ui('admin.lostAccess', (data?.locale ?? 'en') as Locale)}
			</a>
		</div>
	</HudPanel>
</main>
