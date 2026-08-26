<script lang="ts">
	import { toast, type Toast, type ToastKind } from '$lib/toast.svelte';

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

	// Which toast last had its text copied, so the button can confirm it. An id
	// rather than a boolean: two toasts can be on screen and only one was copied.
	let copiedId = $state<number | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Put text on the clipboard, by whichever route this browser allows.
	 *
	 * navigator.clipboard exists only in a secure context — true for the admin
	 * in production, false for the plain-http dev box on the LAN — so the
	 * deprecated textarea trick stays as the fallback rather than the feature
	 * silently doing nothing on a laptop.
	 */
	async function writeClipboard(text: string): Promise<boolean> {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch {
			// Denied or unavailable — try the fallback before giving up.
		}

		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.top = '0';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			ta.remove();
			return ok;
		} catch {
			return false;
		}
	}

	// Deliberately does NOT raise a toast of its own to confirm — a toast about
	// a toast, in the corner the user is already reading, and it would collapse
	// into the very stack they are trying to copy out of. The tick is enough.
	async function copyToast(t: Toast) {
		if (!(await writeClipboard(t.message))) return;
		copiedId = t.id;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copiedId = null), 1600);
	}

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
				class="toast glass chamfer-tr pointer-events-auto relative flex items-start gap-3 p-3.5 pr-16"
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

				<div class="absolute top-2.5 right-2.5 flex items-center gap-2">
					<!-- Copy first: an error worth reading is usually an error worth
					     pasting somewhere, and the messages here can be long enough
					     that retyping one is not realistic. -->
					<button
						type="button"
						onclick={() => copyToast(t)}
						aria-label={copiedId === t.id ? 'Message copied' : 'Copy message to clipboard'}
						title="Copy message"
						class="text-outline transition-colors hover:text-on-surface"
						style={copiedId === t.id ? `color: ${s.accent}` : ''}
					>
						{#if copiedId === t.id}
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								aria-hidden="true"
							>
								<path d="M20 6L9 17l-5-5" />
							</svg>
						{:else}
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								aria-hidden="true"
							>
								<rect x="9" y="9" width="11" height="11" rx="1.5" />
								<path d="M5 15V5a1.5 1.5 0 011.5-1.5H15" />
							</svg>
						{/if}
					</button>

					<button
						type="button"
						onclick={() => toast.dismiss(t.id)}
						aria-label="Dismiss notification"
						class="text-outline transition-colors hover:text-on-surface"
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
			</div>
		{/each}
	</div>
{/if}

<style>
	/* A popover gets UA defaults (centred, bordered, auto size) that must be
	   undone — the positioning here is our own.

	   The offsets are declared HERE rather than left to the top-16/right-4
	   utilities on the element. Svelte scopes this rule to `.toast-host.svelte-*`,
	   which outranks a single Tailwind class, so `inset: auto` alone silently
	   beat them and dropped every toast in the top-LEFT corner. */
	.toast-host {
		margin: 0;
		border: 0;
		padding: 0;
		background: transparent;
		overflow: visible;
		inset: auto;
		top: 4rem;
		right: 1rem;
		bottom: auto;
		left: auto;
	}
	@media (min-width: 768px) {
		.toast-host {
			top: 5rem;
			right: 1.5rem;
		}
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
