<script lang="ts">
	// Uploads straight to object storage and hands back the stored URL, which
	// is the only thing that ends up in the database.
	let {
		value = $bindable(''),
		folder = 'uploads',
		label = 'Image'
	}: { value?: string; folder?: string; label?: string } = $props();

	let input = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let error = $state('');
	let dragging = $state(false);

	async function upload(file: File) {
		busy = true;
		error = '';
		try {
			const body = new FormData();
			body.append('file', file);
			body.append('folder', folder);

			const res = await fetch('/api/v1/uploads', { method: 'POST', body });
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) throw new Error(payload?.message ?? `Upload failed (${res.status})`);
			value = payload.url;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			busy = false;
			if (input) input.value = ''; // let the same file be picked again
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) upload(file);
	}
</script>

<div class="flex flex-col gap-2">
	<span class="font-mono text-xs tracking-[0.1em] text-outline uppercase">{label}</span>

	<div class="flex items-start gap-3">
		{#if value}
			<img
				src={value}
				alt=""
				class="h-16 w-16 shrink-0 border border-white/10 object-cover"
				loading="lazy"
			/>
		{/if}

		<div class="min-w-0 flex-1">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				role="button"
				tabindex="0"
				class="flex cursor-pointer items-center justify-center border border-dashed px-4 py-4 text-center transition-colors {dragging
					? 'border-primary-container bg-primary-container/5'
					: 'border-outline/50 hover:border-primary-container'}"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				onclick={() => input?.click()}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						input?.click();
					}
				}}
			>
				<span class="font-mono text-xs text-on-surface-variant">
					{busy ? 'Uploading…' : 'Drop an image here, or click to choose'}
				</span>
			</div>

			<input
				bind:this={input}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/avif,image/gif,application/pdf"
				class="hidden"
				onchange={(e) => {
					const f = e.currentTarget.files?.[0];
					if (f) upload(f);
				}}
			/>

			<!-- The URL stays editable: paste an external one, or clear it. -->
			<input
				bind:value
				placeholder="/cdn/portafolio/…"
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
