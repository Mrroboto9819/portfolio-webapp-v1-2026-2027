// Shared player state.
//
// ONE <audio> element for the whole app, created lazily on first play. Two
// surfaces drive it — the floating desktop widget and the controls inside the
// drawer — and they must be the same player, not two that fight each other.
//
// NOTHING HERE EVER STARTS AUDIO ON ITS OWN.
//
// There is exactly one way sound begins: the listener presses a play control,
// which calls toggle() or playAt(). No scroll handler, no timer, no "resume
// what you were playing", no once-a-day allowance. This is not a default that
// can be configured back on — the code paths that did it are gone.
//
// This is a hard requirement, learned the expensive way: the site opened in an
// interview and started playing music. A portfolio that makes noise at someone
// without being asked is worse than a portfolio with no music at all.
//
// Continuation across a reload still works, but as STATE, not as playback: the
// track, the position and the volume come back, the transport comes back
// paused, and pressing play picks up exactly where they left off. The element
// is primed with `preload="metadata"` so the widget can show the track and the
// elapsed time WITHOUT making a sound.

import { browser } from '$app/environment';
import { readJSON, writeJSON } from '$lib/persist';
import type { Song } from '$lib/types';

const KEY = 'music';
/** Position is written at most this often; `timeupdate` fires ~4x a second. */
const SAVE_EVERY_MS = 1500;

/**
 * What survives a reload.
 *
 * The track is stored by URL, not by index: the queue is admin-editable, so a
 * saved index would silently point at a different song the moment a track is
 * added, removed or reordered.
 *
 * There is deliberately no `playing` field. Persisting it would mean storing a
 * value whose only purpose is to make sound happen on the next page load, and
 * that is the thing this player must never do.
 */
type Saved = {
	url: string;
	position: number;
	volume: number;
	muted: boolean;
	/** How the queue advances. Persisted like volume: it is a setting. */
	repeat?: RepeatMode;
	shuffle?: boolean;
};

/**
 * What happens when a track ends.
 *
 *   'all'  — step to the next track, wrapping at the end. The default, and
 *            what this player has always done.
 *   'one'  — replay the same track forever.
 *   'off'  — stop at the end of the queue instead of wrapping.
 */
export type RepeatMode = 'all' | 'one' | 'off';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

class Player {
	queue = $state<Song[]>([]);
	index = $state(0);
	playing = $state(false);
	volume = $state(0.6);
	muted = $state(false);
	position = $state(0);
	duration = $state(0);
	repeat = $state<RepeatMode>('all');
	shuffle = $state(false);

	/** True once a previous visit's track and position have been restored. */
	restored = $state(false);

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
		// Repeat and shuffle restore for the same reason volume does: they are
		// settings about how this site behaves, not part of one listening
		// session. Neither can start audio, so restoring them is safe.
		if (saved.repeat === 'all' || saved.repeat === 'one' || saved.repeat === 'off') {
			this.repeat = saved.repeat;
		}
		this.shuffle = Boolean(saved.shuffle);
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
		// Primed, never played. Restoring is where the old code called #resume()
		// and where the interview incident came from.
		this.#prime();
	}

	#prime() {
		const el = this.#audio();
		const song = this.current;
		if (!el || !song) return;
		el.preload = 'metadata';
		if (el.src !== new URL(song.url, location.origin).href) el.src = song.url;
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
		// End of track. `next()` reads the repeat and shuffle settings, so the
		// only thing decided here is that a finished track advances at all.
		el.addEventListener('ended', () => this.next({ automatic: true }));
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
			// The only entry point for sound in the whole app.
			await this.playAt(this.index);
		}
	}

	/**
	 * Advance.
	 *
	 * `automatic` marks the call as "the track ended by itself" rather than
	 * "someone pressed skip", and the two must behave differently: repeat-one
	 * replays on its own but must still let a person skip forward, and
	 * repeat-off stops at the end of the queue without stranding the skip
	 * button.
	 */
	next(opts: { automatic?: boolean } = {}) {
		if (!this.queue.length) return;

		if (opts.automatic && this.repeat === 'one') {
			this.seek(0);
			this.playAt(this.index);
			return;
		}

		if (this.shuffle) {
			this.playAt(this.#randomOther());
			return;
		}

		const last = this.index >= this.queue.length - 1;
		if (opts.automatic && last && this.repeat === 'off') {
			// End of the set: stop rather than wrap, and leave the transport on
			// the final track so pressing play starts it again.
			this.stop();
			return;
		}

		this.playAt(this.index + 1);
	}

	prev() {
		// Restart the track first, like every other player, before stepping back.
		if (this.position > 3) this.seek(0);
		else if (this.shuffle) this.playAt(this.#randomOther());
		else this.playAt(this.index - 1);
	}

	/**
	 * A random index that is NOT the current one.
	 *
	 * Picking from the other n-1 positions rather than re-rolling until it
	 * differs: with a two-track queue a re-roll loop can spin, and repeating the
	 * track you are already on is the one outcome shuffle must never produce.
	 * A one-track queue has no other index, so it stays put.
	 */
	#randomOther(): number {
		const n = this.queue.length;
		if (n <= 1) return this.index;
		const r = Math.floor(Math.random() * (n - 1));
		return r >= this.index ? r + 1 : r;
	}

	setRepeat(mode: RepeatMode) {
		this.repeat = mode;
		this.#save(true);
	}

	/** Cycle the button through all → one → off, which is the usual order. */
	cycleRepeat() {
		this.setRepeat(this.repeat === 'all' ? 'one' : this.repeat === 'one' ? 'off' : 'all');
	}

	toggleShuffle() {
		this.shuffle = !this.shuffle;
		this.#save(true);
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
			volume: this.volume,
			muted: this.muted,
			repeat: this.repeat,
			shuffle: this.shuffle
		} satisfies Saved);
	}
}

export const player = new Player();

export function fmtTime(s: number): string {
	if (!Number.isFinite(s) || s < 0) return '0:00';
	const m = Math.floor(s / 60);
	return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
