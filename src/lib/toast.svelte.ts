// Toast notifications.
//
// Four kinds, a hard cap of four on screen, and identical messages collapse
// into one entry with a count instead of stacking. The cap and the collapsing
// exist for the same reason: a failing loop can raise the same error dozens of
// times, and a wall of identical toasts buries the one thing worth reading.

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export type Toast = {
	id: number;
	kind: ToastKind;
	message: string;
	/** How many times this same message has arrived. Shown as (2), (3)… */
	count: number;
	timeout: number;
};

const MAX_VISIBLE = 4;

/** Errors stay until dismissed; the rest clear themselves. */
const DEFAULT_MS: Record<ToastKind, number> = {
	success: 3500,
	info: 4000,
	warning: 6000,
	error: 0 // 0 = never auto-dismiss
};

class Toaster {
	items = $state<Toast[]>([]);
	#seq = 0;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	push(kind: ToastKind, message: string, ms?: number) {
		const text = String(message ?? '').trim();
		if (!text) return;

		// Same kind AND same text -> bump the counter and restart its timer,
		// rather than adding a duplicate row.
		const existing = this.items.find((t) => t.kind === kind && t.message === text);
		if (existing) {
			existing.count += 1;
			this.#arm(existing.id, ms ?? existing.timeout);
			return existing.id;
		}

		const id = ++this.#seq;
		const timeout = ms ?? DEFAULT_MS[kind];
		this.items = [...this.items, { id, kind, message: text, count: 1, timeout }];

		// Drop the OLDEST when over the cap. Newest is what the user just did.
		if (this.items.length > MAX_VISIBLE) {
			const overflow = this.items.slice(0, this.items.length - MAX_VISIBLE);
			for (const t of overflow) this.#clear(t.id);
			this.items = this.items.slice(-MAX_VISIBLE);
		}

		this.#arm(id, timeout);
		return id;
	}

	#arm(id: number, ms: number) {
		this.#clear(id);
		if (ms > 0)
			this.#timers.set(
				id,
				setTimeout(() => this.dismiss(id), ms)
			);
	}

	#clear(id: number) {
		const t = this.#timers.get(id);
		if (t) clearTimeout(t);
		this.#timers.delete(id);
	}

	dismiss(id: number) {
		this.#clear(id);
		this.items = this.items.filter((t) => t.id !== id);
	}

	clear() {
		for (const t of this.items) this.#clear(t.id);
		this.items = [];
	}

	success = (m: string, ms?: number) => this.push('success', m, ms);
	error = (m: string, ms?: number) => this.push('error', m, ms);
	warning = (m: string, ms?: number) => this.push('warning', m, ms);
	info = (m: string, ms?: number) => this.push('info', m, ms);
}

export const toast = new Toaster();
