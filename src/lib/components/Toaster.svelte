<script lang="ts">
	import { toast, type ToastKind } from '$lib/toast.svelte';

	// Top-right, above everything including the modal backdrop: a toast that
	// reports a failure from inside a dialog is useless behind it.
	let host = $state<HTMLDivElement | null>(null);

	// A <dialog> opened with showModal() lives in the TOP LAYER, which paints
	// above every normal element no matter the z-index — so toasts raised from
	// inside a modal were invisible until it closed. A popover also lives in
	// the top layer, and the layer is ordered by promotion time, so re-showing
	// it on each new toast keeps it above a dialog that opened first.
	$effect(() => {
		const el = host;
		const n = toast.items.length;
		if (!el || typeof el.showPopover !== 'function') return;
		try {
			if (n > 0) {
				if (el.matches(':popover-open')) el.hidePopover();
				el.showPopover();
			} else if (el.matches(':popover-open')) {
				el.hidePopover();
			}
		} catch {
			// Popover unsupported or the element is detached — the fixed-position
			// fallback below still renders, just under a modal.
		}
	});

	const STYLE: Record<ToastKind, { accent: string; label: string; d: string }> = {
		success: {
			accent: '#a1f21d',
			label: 'OK',
			d: 'M20 6L9 17l-5-5'
		},
		error: {
			accent: '#ffb4ab',
			label: 'ERR',
			d: 'M12 8v5M12 17h.01M12 3l9 16H3z'
		},
		warning: {
			accent: '#ffabf3',
			label: 'WARN',
			d: 'M12 9v4M12 17h.01M12 3l9 16H3z'
		},
		info: {
			accent: '#00f3ff',
			label: 'INFO',
			d: 'M12 16v-5M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
		}
	};
</script>

{#if toast.items.length}
	<!-- aria-live so a screen reader hears the message; the icon and the
	     prefix carry the kind, so it is never colour alone. -->
	<div
		bind:this={host}
		popover="manual"
		class="toast-host pointer-events-none fixed top-16 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2 md:top-20 md:right-6"
		role="region"
		aria-label="Notifications"
	>
		{#each toast.items as t (t.id)}
			{@const s = STYLE[t.kind]}
			<div
				class="toast glass chamfer-tr pointer-events-auto relative flex items-start gap-3 p-3.5 pr-9"
				style="border-left: 3px solid {s.accent}; box-shadow: 0 0 18px {s.accent}22"
				role={t.kind === 'error' ? 'alert' : 'status'}
				aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
			>
				<span class="mt-0.5 shrink-0" style="color: {s.accent}">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						aria-hidden="true"
					>
						<path d={s.d} />
					</svg>
				</span>

				<div class="min-w-0 flex-1">
					<div class="mb-0.5 flex items-center gap-2">
						<span class="font-mono text-xs font-bold tracking-[0.14em]" style="color: {s.accent}"
							>{s.label}</span
						>
						{#if t.count > 1}
							<!-- repeat counter, so a loop of identical failures reads as
							     one message rather than four identical rows -->
							<span
								class="border px-1.5 font-mono text-xs"
								style="color: {s.accent}; border-color: {s.accent}55"
							>
								{t.count}
							</span>
						{/if}
					</div>
					<p class="m-0 font-mono text-xs leading-relaxed break-words text-on-surface-variant">
						{t.message}
					</p>
				</div>

				<button
					type="button"
					onclick={() => toast.dismiss(t.id)}
					aria-label="Dismiss notification"
					class="absolute top-2.5 right-2.5 text-outline transition-colors hover:text-on-surface"
				>
					<svg
						width="13"
						height="13"
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
		{/each}
	</div>
{/if}

<style>
	/* A popover gets UA defaults (centred, bordered, auto size) that must be
	   undone — the positioning here is our own. */
	.toast-host {
		margin: 0;
		border: 0;
		padding: 0;
		background: transparent;
		overflow: visible;
		inset: auto;
	}
	.toast-host::backdrop {
		background: transparent;
	}

	.toast {
		animation: toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(14px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
