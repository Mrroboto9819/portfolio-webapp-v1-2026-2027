// Shared player state.
//
// ONE <audio> element for the whole app, created lazily on first play. Two
// surfaces drive it — the floating desktop widget and the controls inside the
// drawer — and they must be the same player, not two that fight each other.
//
// Lazy creation is deliberate: browsers block autoplay until a user gesture,
// so constructing the element on first interaction keeps the "why is nothing
// happening" case out of the picture entirely.

import type { Song } from '$lib/types';

class Player {
	queue = $state<Song[]>([]);
	index = $state(0);
	playing = $state(false);
	volume = $state(0.6);
	muted = $state(false);
	position = $state(0);
	duration = $state(0);

	#el: HTMLAudioElement | null = null;
	/** True once the listener pressed play; cleared only by an explicit pause. */
	#wantsPlayback = false;

	current = $derived(this.queue[this.index] ?? null);
	progress = $derived(this.duration > 0 ? this.position / this.duration : 0);

	load(songs: Song[]) {
		this.queue = songs;
	}

	#audio(): HTMLAudioElement | null {
		if (typeof window === 'undefined') return null;
		if (this.#el) return this.#el;

		const el = new Audio();
		el.preload = 'none';
		el.volume = this.volume;
		el.addEventListener('timeupdate', () => (this.position = el.currentTime));
		el.addEventListener('durationchange', () => (this.duration = el.duration || 0));
		el.addEventListener('ended', () => this.next());
		el.addEventListener('play', () => (this.playing = true));
		el.addEventListener('pause', () => (this.playing = false));
		// A dead URL must not end the set. If playback was asked for, step to the
		// next track; only give up once nothing in the queue can play.
		el.addEventListener('error', () => {
			this.playing = false;
			if (this.#wantsPlayback) this.playAt(this.index + 1, 1);
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
			this.position = 0;
		} else if (el.ended) {
			// Single-track queue, or replaying the same track: rewind explicitly
			// rather than relying on play() to seek an ended element for us.
			el.currentTime = 0;
		}

		try {
			await el.play();
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
		if (el && Number.isFinite(seconds)) el.currentTime = seconds;
	}

	setVolume(v: number) {
		this.volume = Math.min(1, Math.max(0, v));
		const el = this.#audio();
		if (el) el.volume = this.volume;
		if (this.volume > 0 && this.muted) this.toggleMute();
	}

	toggleMute() {
		this.muted = !this.muted;
		const el = this.#audio();
		if (el) el.muted = this.muted;
	}

	stop() {
		this.#wantsPlayback = false;
		this.#el?.pause();
		this.playing = false;
	}
}

export const player = new Player();

export function fmtTime(s: number): string {
	if (!Number.isFinite(s) || s < 0) return '0:00';
	const m = Math.floor(s / 60);
	return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
