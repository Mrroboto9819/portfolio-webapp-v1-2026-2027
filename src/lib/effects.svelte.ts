// Visual-effects preference.
//
// The atmosphere layers — moving grid, scanlines, CRT, glitch, hover sweeps —
// are the point of this design, but they are also motion on a dark screen for
// as long as someone stays. Some people simply do not want that, and
// prefers-reduced-motion does not cover "I find this distracting".
//
// The choice is applied as a class on <html>, so CSS turns everything off in
// one place rather than every component checking a flag.

import { browser } from '$app/environment';

const KEY = 'fx';
const OFF_CLASS = 'no-fx';

class Effects {
	enabled = $state(true);

	/** Read the stored choice and apply it. Called once, on mount. */
	init() {
		if (!browser) return;
		try {
			// Default ON: the effects are the design. Only an explicit opt-out
			// stored by this visitor turns them off.
			this.enabled = localStorage.getItem(KEY) !== 'off';
		} catch {
			// Private mode or blocked storage — keep the default rather than fail.
		}
		this.#apply();
	}

	toggle() {
		this.enabled = !this.enabled;
		try {
			localStorage.setItem(KEY, this.enabled ? 'on' : 'off');
		} catch {
			/* not fatal: the choice just will not survive a reload */
		}
		this.#apply();
	}

	#apply() {
		if (!browser) return;
		document.documentElement.classList.toggle(OFF_CLASS, !this.enabled);
	}
}

export const effects = new Effects();
