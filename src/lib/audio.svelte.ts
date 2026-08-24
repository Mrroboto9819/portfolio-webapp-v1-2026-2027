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
		// A dead URL must not leave the UI stuck showing "playing".
		el.addEventListener('error', () => (this.playing = false));
		this.#el = el;
		return el;
	}

	async playAt(i: number) {
		if (!this.queue.length) return;
		this.index = ((i % this.queue.length) + this.queue.length) % this.queue.length;
		const el = this.#audio();
		const song = this.queue[this.index];
		if (!el || !song) return;

		if (el.src !== new URL(song.url, location.origin).href) {
			el.src = song.url;
			this.position = 0;
		}
		try {
			await el.play();
		} catch {
			// Autoplay refused, or the file failed to load. Reflect reality.
			this.playing = false;
		}
	}

	async toggle() {
		const el = this.#audio();
		if (!el) return;
		if (this.playing) el.pause();
		else await this.playAt(this.index);
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
