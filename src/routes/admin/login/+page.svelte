<script lang="ts">
	import { enhance } from '$app/forms';
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
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
				<input
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
				/>
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

		<a
			href="/"
			class="mt-6 inline-block font-mono text-xs tracking-[0.1em] text-outline uppercase transition-colors hover:text-primary-container"
		>
			&larr; Return to site
		</a>
	</HudPanel>
</main>
