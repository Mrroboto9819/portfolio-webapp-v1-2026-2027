<script lang="ts">
	// Hold-to-confirm. A destructive action should cost more than one twitchy
	// click, and a hold is better than a second "are you sure" dialog: the
	// progress is visible, and letting go cancels it with no dead end.
	//
	// The fill is driven by requestAnimationFrame against wall-clock time, not
	// a CSS transition, so the label can track the same progress value and a
	// dropped frame cannot desynchronise the two.
	let {
		duration = 1200,
		label = 'Hold to delete',
		confirmLabel = 'Release to cancel',
		doneLabel = 'Deleting…',
		onconfirm
	}: {
		duration?: number;
		label?: string;
		confirmLabel?: string;
		doneLabel?: string;
		onconfirm: () => void;
	} = $props();

	let progress = $state(0); // 0 → 1
	let holding = $state(false);
	let fired = $state(false);
	let raf = 0;
	let startedAt = 0;

	function tick(now: number) {
		progress = Math.min(1, (now - startedAt) / duration);
		if (progress >= 1) {
			if (!fired) {
				fired = true;
				holding = false;
				onconfirm();
			}
			return;
		}
		raf = requestAnimationFrame(tick);
	}

	function start(e: Event) {
		if (fired) return;
		e.preventDefault();
		holding = true;
		startedAt = performance.now();
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
	}

	function cancel() {
		if (fired) return;
		cancelAnimationFrame(raf);
		holding = false;
		progress = 0;
	}

	$effect(() => () => cancelAnimationFrame(raf));

	// Colour walks outline → warning → danger as the hold advances, so the
	// state is legible without reading the label.
	const tint = $derived(
		fired ? '#ffb4ab' : progress > 0.66 ? '#ffb4ab' : progress > 0.33 ? '#fe00fe' : '#849495'
	);
	const text = $derived(fired ? doneLabel : holding ? confirmLabel : label);
</script>

<button
	type="button"
	class="clip-corner relative w-full overflow-hidden border px-6 py-3 font-mono text-xs font-bold tracking-[0.12em] uppercase transition-colors select-none"
	style="border-color: {tint}; color: {tint}"
	disabled={fired}
	onpointerdown={start}
	onpointerup={cancel}
	onpointerleave={cancel}
	onpointercancel={cancel}
	onkeydown={(e) => {
		if ((e.key === 'Enter' || e.key === ' ') && !holding) start(e);
	}}
	onkeyup={cancel}
	onblur={cancel}
	aria-label="{label} — hold to confirm"
>
	<!-- the fill: outlined at rest, filling toward danger as the hold runs -->
	<span
		class="absolute inset-y-0 left-0 -z-0"
		style="width: {progress *
			100}%; background: {tint}; opacity: 0.28; transition: background 160ms linear"
		aria-hidden="true"
	></span>

	<span class="relative z-10">{text}</span>

	<!-- progress is announced, not just painted -->
	<span class="sr-only" role="status" aria-live="polite">
		{fired ? 'Confirmed' : holding ? `${Math.round(progress * 100)} percent` : ''}
	</span>
</button>
