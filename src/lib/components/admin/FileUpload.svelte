<script lang="ts">
	import { toast } from '$lib/toast.svelte';
	import { adminApi, messageFrom } from '$lib/api';
	// Uploads straight to object storage and hands back the stored URL, which
	// is the only thing that ends up in the database.
	//
	// Uploads go through the admin axios client: it reports real transfer
	// progress (fetch cannot), redirects on an expired session, and returns the
	// server's message already in the reader's language.
	let {
		value = $bindable(''),
		folder = 'uploads',
		label = 'Image',
		kind = 'image',
		onbusy
	}: {
		value?: string;
		folder?: string;
		label?: string;
		kind?: 'image' | 'audio';
		/** Reports in-flight state so a parent can block its Save button. */
		onbusy?: (busy: boolean) => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let progress = $state(0);
	let error = $state('');
	let dragging = $state(false);
	let fileName = $state('');

	const accept = $derived(
		kind === 'audio'
			? 'audio/mpeg,audio/mp3'
			: 'image/png,image/jpeg,image/webp,image/avif,image/gif,application/pdf'
	);
	const hint = $derived(
		kind === 'audio' ? 'MP3 · max 24 MB' : 'PNG, JPEG, WebP, AVIF, GIF or PDF · max 8 MB'
	);

	function setBusy(b: boolean) {
		busy = b;
		onbusy?.(b);
	}

	async function upload(file: File) {
		setBusy(true);
		error = '';
		progress = 0;
		fileName = file.name;

		const body = new FormData();
		body.append('file', file);
		body.append('folder', folder);

		try {
			// axios reports upload progress natively (fetch cannot), and the admin
			// client already handles an expired session and localises the message.
			const { data } = await adminApi.post<{ url: string }>('/uploads', body, {
				onUploadProgress: (e) => {
					if (e.total) progress = e.loaded / e.total;
				}
			});
			value = data.url;
			progress = 1;
			toast.success(`${file.name} uploaded`);
		} catch (err) {
			error = messageFrom(err);
			toast.error(`${file.name}: ${error}`);
		} finally {
			setBusy(false);
			if (input) input.value = ''; // let the same file be picked again
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) upload(file);
	}

	const pct = $derived(Math.round(progress * 100));

	// Preview element is local to this field and separate from the site player,
	// so auditioning an upload never hijacks whatever is playing on the page.
	let previewEl: HTMLAudioElement | null = null;
	let previewing = $state(false);

	function togglePreview() {
		if (!value) return;
		if (!previewEl) {
			previewEl = new Audio(value);
			previewEl.addEventListener('ended', () => (previewing = false));
			previewEl.addEventListener('pause', () => (previewing = false));
			previewEl.addEventListener('play', () => (previewing = true));
			previewEl.addEventListener('error', () => {
				previewing = false;
				toast.error('Could not play that file');
			});
		}
		if (previewEl.src !== new URL(value, location.origin).href) previewEl.src = value;
		if (previewing) previewEl.pause();
		else previewEl.play().catch(() => (previewing = false));
	}

	$effect(() => () => previewEl?.pause());
</script>

<div class="flex flex-col gap-2">
	<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">{label}</span>

	<div class="flex items-start gap-3">
		{#if value && kind === 'image'}
			<img
				src={value}
				alt=""
				class="h-16 w-16 shrink-0 border border-white/10 object-cover"
				loading="lazy"
			/>
		{:else if value && kind === 'audio'}
			<!-- A bespoke preview rather than <audio controls>: the native player
			     is a chrome-coloured slab that ignores the design system entirely.
			     One button is all this needs — confirming the right file landed. -->
			<button
				type="button"
				onclick={togglePreview}
				aria-label={previewing ? 'Stop preview' : 'Preview audio'}
				class="clip-corner flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 border border-primary-container/40 bg-primary-container/5 text-primary-container transition-colors hover:bg-primary-container/15"
			>
				{#if previewing}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg
					>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path d="M7 5l12 7-12 7z" /></svg
					>
				{/if}
				<span class="font-mono text-[10px] tracking-[0.1em]">
					{previewing ? 'STOP' : 'PLAY'}
				</span>
			</button>
		{/if}

		<div class="min-w-0 flex-1">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				role="button"
				tabindex={busy ? -1 : 0}
				aria-busy={busy}
				class="relative flex cursor-pointer items-center justify-center overflow-hidden border border-dashed px-4 py-4 text-center transition-colors {busy
					? 'cursor-wait border-primary-container/60'
					: dragging
						? 'border-primary-container bg-primary-container/5'
						: 'border-outline/50 hover:border-primary-container'}"
				ondragover={(e) => {
					if (busy) return;
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				onclick={() => !busy && input?.click()}
				onkeydown={(e) => {
					if (!busy && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						input?.click();
					}
				}}
			>
				{#if busy}
					<!-- real transfer progress, not an indeterminate spinner -->
					<span
						class="absolute inset-y-0 left-0 bg-primary-container/15 transition-[width] duration-150"
						style="width: {pct}%"
						aria-hidden="true"
					></span>
					<span class="relative flex items-center gap-2.5 font-mono text-xs text-primary-container">
						<span class="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
							{#each [0, 1, 2] as b (b)}
								<span
									class="w-[2px] bg-primary-container"
									style="height: 100%; animation: fu-eq 700ms {b *
										130}ms ease-in-out infinite alternate"
								></span>
							{/each}
						</span>
						UPLOADING {pct}%
						<span class="text-outline">· {fileName}</span>
					</span>
				{:else}
					<span class="font-mono text-xs text-on-surface-variant">
						{kind === 'audio'
							? 'Drop an MP3 here, or click to choose'
							: 'Drop an image here, or click to choose'}
					</span>
				{/if}
			</div>

			<input
				bind:this={input}
				type="file"
				{accept}
				class="hidden"
				disabled={busy}
				onchange={(e) => {
					const f = e.currentTarget.files?.[0];
					if (f) upload(f);
				}}
			/>

			<!-- The URL stays editable: paste an external one, or clear it. -->
			<input
				bind:value
				placeholder="/cdn/portafolio/…"
				disabled={busy}
				class="mt-2 w-full border border-outline/40 bg-surface-lowest/60 px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary-container"
			/>

			{#if error}
				<p class="mt-2 m-0 font-mono text-xs text-error" role="alert">{error}</p>
			{:else}
				<p class="mt-2 m-0 font-mono text-xs text-outline">
					PNG, JPEG, WebP, AVIF, GIF or PDF · max 8 MB
				</p>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes fu-eq {
		from {
			height: 25%;
		}
		to {
			height: 100%;
		}
	}
</style>
