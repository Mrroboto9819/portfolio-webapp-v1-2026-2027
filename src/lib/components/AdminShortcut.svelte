<script lang="ts">
	import { goto } from '$app/navigation';

	// The admin door. Change the combo here — it is referenced nowhere else.
	//
	// NOTE: Ctrl/Cmd+L is the browser's own "focus the address bar" shortcut in
	// Chrome, Firefox, Safari and Edge. Capturing it means a visitor who reaches
	// for the URL bar gets navigated instead. It works, but it overrides a
	// universal browser affordance for everyone, not just you. If that bites,
	// SHORTCUT_KEY = 'l' with requireShift = true (Ctrl/Cmd+Shift+L) collides
	// with nothing.
	const SHORTCUT_KEY = 'l';
	const requireShift = false;
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
</script>

<svelte:window on:keydown={onKeydown} />
