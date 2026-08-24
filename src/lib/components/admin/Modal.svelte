<script lang="ts">
	// Built on the native <dialog>, deliberately: showModal() gives focus
	// trapping, inertness of the page behind, Escape-to-close and correct
	// screen-reader semantics for free.
	//
	// `open` is a PLAIN prop and the parent owns the state. It used to be
	// $bindable while callers passed a derived expression (`editing !== null`)
	// and the component assigned back into it — an assignment that cannot
	// propagate, which is why the dialog never opened. Closing is reported
	// through onclose instead, so there is exactly one owner of the state.
	let {
		open = false,
		title,
		size = 'md',
		onclose,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		size?: 'md' | 'lg';
		onclose?: () => void;
		children: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		const el = dialog;
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	const width = $derived(size === 'lg' ? 'w-[min(94vw,880px)]' : 'w-[min(94vw,620px)]');
</script>

<dialog
	bind:this={dialog}
	class="glass chamfer-tr m-auto max-h-[90dvh] {width} overflow-visible p-0 text-on-surface backdrop:bg-surface-lowest/80 backdrop:backdrop-blur-sm"
	onclose={() => onclose?.()}
	onclick={(e) => {
		// Clicking the backdrop closes. The dialog element itself is the
		// backdrop's event target, so compare against the content box.
		if (e.target === dialog) onclose?.();
	}}
>
	<div class="flex max-h-[90dvh] flex-col">
		<header class="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
			<h2 class="m-0 font-mono text-sm tracking-[0.12em] text-secondary uppercase">{title}</h2>
			<button
				type="button"
				onclick={() => onclose?.()}
				aria-label="Close"
				class="flex h-8 w-8 items-center justify-center border border-primary-container/40 text-primary-container transition-colors hover:bg-primary-container/10"
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
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
			{@render children()}
		</div>

		{#if footer}
			<footer class="shrink-0 border-t border-white/10 px-6 py-4">
				{@render footer()}
			</footer>
		{/if}
	</div>
</dialog>
