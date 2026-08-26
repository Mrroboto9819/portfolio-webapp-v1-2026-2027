<script lang="ts">
	import { enhance } from '$app/forms';
	import Atmosphere from '$lib/components/Atmosphere.svelte';
	import HudPanel from '$lib/components/HudPanel.svelte';
	import { ui, type Locale } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const locale = $derived((data.locale ?? 'en') as Locale);
	const T = $derived((key: string) => ui(key, locale));

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Admin — {T('admin.recoverTitle')}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="crt" aria-hidden="true"></div>
<Atmosphere />

<main class="relative z-10 flex min-h-dvh items-center justify-center px-margin-mobile">
	<HudPanel chamfer="corner" class="hud-corners relative w-full max-w-sm p-8">
		<div class="mb-6 flex items-center gap-2.5">
			<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary-container"></span>
			<span class="font-mono text-xs tracking-[0.1em] text-secondary uppercase"> // RECOVERY </span>
		</div>

		<h1
			class="glow-hero m-0 mb-5 text-2xl font-extrabold tracking-[-0.03em] text-primary uppercase"
		>
			{T('admin.recoverTitle')}
		</h1>

		<div class="rule mb-6"></div>

		{#if form?.sent}
			<!-- Deliberately the same message whether or not anything was sent. -->
			<p
				class="m-0 mb-6 border border-primary-container/40 bg-primary-container/10 px-3 py-3 font-mono text-xs leading-relaxed text-primary-container"
				role="status"
			>
				{form.message}
			</p>
			<p class="mt-0 mb-6 font-mono text-[11px] leading-relaxed text-outline">
				{T('admin.recoverAfter')}
			</p>
		{:else}
			<p class="mt-0 mb-6 font-mono text-xs leading-relaxed text-outline">
				{T('admin.recoverIntro')}
			</p>

			{#if !data.mailReady}
				<p
					class="m-0 mb-4 border border-error/40 bg-error/10 px-3 py-2 font-mono text-xs text-error"
					role="alert"
				>
					{T('admin.recoverNoMail')}
				</p>
			{/if}

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
					<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">
						{T('admin.recoverField')}
					</span>
					<input
						name="identifier"
						autocomplete="username"
						required
						class="border border-outline/40 bg-surface-lowest/60 px-3 py-2.5 font-mono text-sm text-on-surface outline-none transition-colors focus:border-primary-container"
					/>
				</label>

				{#if form?.message && !form?.sent}
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
					{submitting ? T('admin.recoverSending') : T('admin.recoverSend')}
				</button>
			</form>
		{/if}

		<a
			href="/admin/login"
			class="mt-6 inline-block font-mono text-xs tracking-[0.1em] text-outline uppercase transition-colors hover:text-primary-container"
		>
			{T('admin.backToSignIn')}
		</a>
	</HudPanel>
</main>
