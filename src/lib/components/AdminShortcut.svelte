<script lang="ts">
	import { goto } from '$app/navigation';

	// The admin door. Both ways in are configured here — they are referenced
	// nowhere else, so changing the combo or the hold time is a one-file edit.
	//
	// DESKTOP: Ctrl/Cmd+L.
	// NOTE: that is the browser's own "focus the address bar" shortcut in
	// Chrome, Firefox, Safari and Edge. Capturing it means a visitor who reaches
	// for the URL bar gets navigated instead. It works, but it overrides a
	// universal browser affordance for everyone, not just you. If that bites,
	// SHORTCUT_KEY = 'l' with requireShift = true (Ctrl/Cmd+Shift+L) collides
	// with nothing.
	//
	// TOUCH: a long press on any element marked `data-admin-door` — the drawer's
	// avatar carries it. A phone has no modifier keys, so the keyboard combo is
	// unreachable there; without this the admin is desktop-only. A long press
	// rather than a visible button because the door should stay quiet on a
	// public portfolio, and rather than a tap-count because a stray double tap
	// on an avatar is far likelier than a deliberate 1.1-second hold.
	const SHORTCUT_KEY = 'l';
	const requireShift = false;
	const HOLD_MS = 1100;
	const ADMIN_LOGIN_URL = '/admin/login';

	function onKeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== SHORTCUT_KEY) return;
		if (!(event.ctrlKey || event.metaKey)) return;
		if (requireShift !== event.shiftKey) return;

		// Don't hijack the combo while someone is typing in a field.
		const el = document.activeElement;
		if (
			el instanceof HTMLInputElement ||
			el instanceof HTMLTextAreaElement ||
			(el instanceof HTMLElement && el.isContentEditable)
		) {
			return;
		}

		event.preventDefault();
		goto(ADMIN_LOGIN_URL);
	}

	/** How far a finger may drift before the hold counts as a scroll instead. */
	const SLOP_PX = 12;

	let timer: ReturnType<typeof setTimeout> | null = null;
	let origin: { x: number; y: number } | null = null;

	function cancelHold() {
		if (timer) clearTimeout(timer);
		timer = null;
		origin = null;
	}

	function onPointerDown(event: PointerEvent) {
		const target = event.target as Element | null;
		if (!target?.closest?.('[data-admin-door]')) return;
		cancelHold();
		origin = { x: event.clientX, y: event.clientY };
		timer = setTimeout(() => {
			timer = null;
			origin = null;
			goto(ADMIN_LOGIN_URL);
		}, HOLD_MS);
	}

	// A finger never holds perfectly still, so only real movement cancels —
	// tested against the press origin rather than the previous event, which
	// would let a slow drag accumulate unnoticed.
	function onPointerMove(event: PointerEvent) {
		if (!origin) return;
		if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SLOP_PX) cancelHold();
	}

	$effect(() => () => cancelHold());
</script>

<svelte:window
	on:keydown={onKeydown}
	on:pointerdown={onPointerDown}
	on:pointerup={cancelHold}
	on:pointercancel={cancelHold}
	on:pointermove={onPointerMove}
	on:blur={cancelHold}
/>
