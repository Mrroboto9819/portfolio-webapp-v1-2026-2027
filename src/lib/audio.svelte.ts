// Shared player state.
//
// ONE <audio> element for the whole app, created lazily on first play. Two
// surfaces drive it — the floating desktop widget and the controls inside the
// drawer — and they must be the same player, not two that fight each other.
//
// Lazy creation is deliberate: browsers block autoplay until a user gesture,
// so constructing the element on first interaction keeps the "why is nothing
// happening" case out of the picture entirely. The one exception is restoring
// a previous visit, where the element is primed with `preload="metadata"` so
// the widget can show the track and where the listener was WITHOUT playing.
//
// The listener's session survives a reload: which track, how far in, whether
// it was playing, and how loud. That state is browser-local (see persist.ts) —
// it is the one thing the server cannot know.

import { browser } from '$app/environment';
import { olderThan, readJSON, stamp, writeJSON } from '$lib/persist';
import type { Song } from '$lib/types';

const KEY = 'music';
const AUTOPLAY_KEY = 'music:autoplay-at';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Position is written at most this often; `timeupdate` fires ~4x a second. */
const SAVE_EVERY_MS = 1500;

/**
 * What survives a reload.
 *
 * The track is stored by URL, not by index: the queue is admin-editable, so a
 * saved index would silently point at a different song the moment a track is
 * added, removed or reordered.
 */
type Saved = {
	url: string;
	position: number;
	playing: boolean;
	volume: number;
	muted: boolean;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

class Player {
	queue = $state<Song[]>([]);
	index = $state(0);
	playing = $state(false);
	volume = $state(0.6);
	muted = $state(false);
	position = $state(0);
	duration = $state(0);

	/** True once a previous visit has been restored into this one. */
	restored = $state(false);
	/** A restore the browser refused for want of a gesture, waiting for one. */
	resumePending = $state(false);

	#el: HTMLAudioElement | null = null;
	/** True once the listener pressed play; cleared only by an explicit pause. */
	#wantsPlayback = false;
	#hydrated = false;
	/** Seek to apply as soon as the element reports metadata for the track. */
	#pendingSeek = 0;
	#lastSave = 0;

	current = $derived(this.queue[this.index] ?? null);
	progress = $derived(this.duration > 0 ? this.position / this.duration : 0);

	/**
	 * Hand the player its queue.
	 *
	 * Called from an effect on every surface that renders controls, so it runs
	 * more than once and on every navigation — restoring is guarded to happen
	 * exactly once, the first time there is actually a queue to match against.
	 */
	load(songs: Song[]) {
		this.queue = songs;
		this.#applySavedVolume();
		if (!this.#hydrated && songs.length) this.#restore();
	}

	// ------------------------------------------------------------ restore ---

	/**
	 * Volume is applied even with an empty queue and even when the saved track
	 * is gone: "how loud this site is" is a setting, not part of a session.
	 */
	#applySavedVolume() {
		const saved = readJSON<Saved | null>(KEY, null);
		if (!saved) return;
		if (typeof saved.volume === 'number') this.volume = clamp01(saved.volume);
		this.muted = Boolean(saved.muted);
		const el = this.#el;
		if (el) {
			el.volume = this.volume;
			el.muted = this.muted;
		}
	}

	#restore() {
		this.#hydrated = true;
		const saved = readJSON<Saved | null>(KEY, null);
		if (!saved || typeof saved.url !== 'string') return;

		const i = this.queue.findIndex((s) => s.url === saved.url);
		// The track was removed from the queue while they were away. Volume is
		// already applied; there is no position left to restore.
		if (i < 0) return;

		this.index = i;
		this.position = Number.isFinite(saved.position) ? Math.max(0, saved.position) : 0;
		this.#pendingSeek = this.position;
		this.restored = true;

		// Load metadata only. This shows the track title, duration and elapsed
		// time in the widget without making a sound, so a restored-but-paused
		// session looks exactly like the one they left.
		this.#prime();

		if (saved.playing) this.#resume();
	}

	#prime() {
		const el = this.#audio();
		const song = this.current;
		if (!el || !song) return;
		el.preload = 'metadata';
		if (el.src !== new URL(song.url, location.origin).href) el.src = song.url;
	}

	/**
	 * Resume a session that was playing when the tab closed.
	 *
	 * Almost every browser refuses this without a prior gesture on the origin,
	 * which is not a failure — it is the platform. The attempt is armed instead
	 * and fires on the reader's first interaction, so the track picks up where
	 * it left off rather than being lost.
	 */
	async #resume() {
		await this.playAt(this.index);
		if (!this.playing) this.resumePending = true;
	}

	/**
	 * Retry a refused restore. Returns true when playback actually started.
	 *
	 * It stays armed after a failure: the first gesture on a page can arrive
	 * before the browser considers the origin activated, and disarming there
	 * would drop the session for good.
	 */
	async resumeIfArmed(): Promise<boolean> {
		if (!this.resumePending || !this.queue.length) return false;
		await this.playAt(this.index);
		if (!this.playing) return false;
		this.resumePending = false;
		return true;
	}

	// ----------------------------------------------------------- autoplay ---

	/**
	 * May the scroll-triggered autoplay run?
	 *
	 * Once per 24 hours, and never when a previous session was restored — if
	 * they left it paused, starting it again is overriding a decision they
	 * already made.
	 */
	canAutoplay(): boolean {
		return Boolean(this.queue.length) && !this.restored && olderThan(AUTOPLAY_KEY, DAY_MS);
	}

	/**
	 * Attempt the once-a-day autoplay. Returns true if sound actually started.
	 *
	 * The 24-hour clock is stamped on SUCCESS, not on the attempt: a browser
	 * refusing autoplay before any gesture is the common case, and burning the
	 * day's single attempt on a refusal would mean it effectively never ran.
	 */
	async autoplay(): Promise<boolean> {
		if (!this.canAutoplay()) return false;
		await this.playAt(this.index);
		if (this.playing) stamp(AUTOPLAY_KEY);
		return this.playing;
	}

	// ------------------------------------------------------------- engine ---

	#audio(): HTMLAudioElement | null {
		if (typeof window === 'undefined') return null;
		if (this.#el) return this.#el;

		const el = new Audio();
		el.preload = 'none';
		el.volume = this.volume;
		el.muted = this.muted;
		el.addEventListener('timeupdate', () => {
			this.position = el.currentTime;
			this.#save();
		});
		el.addEventListener('durationchange', () => (this.duration = el.duration || 0));
		// The saved position can only be applied once the element knows the
		// track is seekable; setting currentTime before this is discarded.
		el.addEventListener('loadedmetadata', () => {
			if (this.#pendingSeek > 0) {
				el.currentTime = Math.min(this.#pendingSeek, el.duration || this.#pendingSeek);
				this.#pendingSeek = 0;
			}
		});
		el.addEventListener('ended', () => this.next());
		el.addEventListener('play', () => {
			this.playing = true;
			this.#save(true);
		});
		el.addEventListener('pause', () => {
			this.playing = false;
			this.#save(true);
		});
		// A dead URL must not end the set. If playback was asked for, step to the
		// next track; only give up once nothing in the queue can play.
		el.addEventListener('error', () => {
			this.playing = false;
			if (this.#wantsPlayback) this.playAt(this.index + 1, 1);
		});

		// The last few seconds of position would otherwise be lost: `timeupdate`
		// saves are throttled, and a closing tab does not get another one.
		// `pagehide` covers the back/forward cache, which `beforeunload` misses.
		window.addEventListener('pagehide', () => this.#save(true));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') this.#save(true);
		});

		this.#el = el;
		return el;
	}

	/**
	 * Play the track at `i`.
	 *
	 * The index wraps in BOTH directions, which is what makes the queue endless:
	 * `ended` advances, the last track wraps to the first, and playback only
	 * stops when the listener pauses.
	 *
	 * `attempt` counts how many tracks have been skipped after a load failure.
	 * One dead URL must not end the set — but a queue where nothing plays must
	 * not spin forever either, so the walk stops after a full pass.
	 */
	async playAt(i: number, attempt = 0) {
		if (!this.queue.length) return;
		this.index = ((i % this.queue.length) + this.queue.length) % this.queue.length;
		const el = this.#audio();
		const song = this.queue[this.index];
		if (!el || !song) return;

		this.#wantsPlayback = true;

		if (el.src !== new URL(song.url, location.origin).href) {
			el.src = song.url;
			// A restore sets the source and the position together; anything else
			// starting a new track starts it at the beginning.
			this.position = this.#pendingSeek;
		} else if (el.ended) {
			// Single-track queue, or replaying the same track: rewind explicitly
			// rather than relying on play() to seek an ended element for us.
			el.currentTime = 0;
		}

		try {
			await el.play();
			this.#save(true);
		} catch (err) {
			// A browser refusing autoplay is NOT a broken track — it wants a user
			// gesture. Skipping on that would churn the whole queue silently.
			if (err instanceof DOMException && err.name === 'NotAllowedError') {
				this.#wantsPlayback = false;
				this.playing = false;
				return;
			}
			// A media failure: move past it.
			if (attempt + 1 < this.queue.length) {
				await this.playAt(this.index + 1, attempt + 1);
				return;
			}
			this.#wantsPlayback = false;
			this.playing = false;
		}
	}

	async toggle() {
		const el = this.#audio();
		if (!el) return;
		if (this.playing) {
			// An explicit pause is the only thing that ends continuous playback.
			this.#wantsPlayback = false;
			el.pause();
		} else {
			// Pressing play by hand also settles the day's autoplay question:
			// they have heard it, so it should not start itself again later.
			this.resumePending = false;
			stamp(AUTOPLAY_KEY);
			await this.playAt(this.index);
		}
	}

	next() {
		this.playAt(this.index + 1);
	}
	prev() {
		// Restart the track first, like every other player, before stepping back.
		if (this.position > 3) this.seek(0);
		else this.playAt(this.index - 1);
	}

	seek(seconds: number) {
		const el = this.#audio();
		if (el && Number.isFinite(seconds)) {
			el.currentTime = seconds;
			this.position = seconds;
			this.#save(true);
		}
	}

	setVolume(v: number) {
		this.volume = clamp01(v);
		const el = this.#audio();
		if (el) el.volume = this.volume;
		if (this.volume > 0 && this.muted) this.toggleMute();
		else this.#save(true);
	}

	toggleMute() {
		this.muted = !this.muted;
		const el = this.#audio();
		if (el) el.muted = this.muted;
		this.#save(true);
	}

	stop() {
		this.#wantsPlayback = false;
		this.#el?.pause();
		this.playing = false;
		this.#save(true);
	}

	// -------------------------------------------------------------- saving --

	/**
	 * Persist the session.
	 *
	 * Throttled because `timeupdate` fires several times a second and every
	 * write is a synchronous JSON serialise plus a storage hit. `force` is for
	 * the moments that matter — play, pause, seek, volume, tab closing.
	 */
	#save(force = false) {
		if (!browser) return;
		const song = this.current;
		if (!song) return;

		const now = Date.now();
		if (!force && now - this.#lastSave < SAVE_EVERY_MS) return;
		this.#lastSave = now;

		writeJSON(KEY, {
			url: song.url,
			position: this.position,
			playing: this.playing,
			volume: this.volume,
			muted: this.muted
		} satisfies Saved);
	}
}

export const player = new Player();

export function fmtTime(s: number): string {
	if (!Number.isFinite(s) || s < 0) return '0:00';
	const m = Math.floor(s / 60);
	return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
