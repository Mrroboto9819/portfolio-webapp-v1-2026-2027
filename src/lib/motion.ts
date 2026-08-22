// GSAP motion layer.
//
// Everything here is a Svelte action, so it only ever runs in the browser —
// there is no SSR guard to forget. Each action sets its own initial state with
// gsap.set() rather than relying on a CSS class that hides the element: if the
// bundle fails to load or JS is off, the page renders fully instead of blank.
//
// prefers-reduced-motion is honoured at the top of every action: the element is
// left in its final state and no tween is created.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Action } from 'svelte/action';

gsap.registerPlugin(ScrollTrigger);

const reduced = () =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fade + rise as the element scrolls into view. */
export const reveal: Action<HTMLElement, { y?: number; delay?: number } | undefined> = (
	node,
	params
) => {
	if (reduced()) return;
	const { y = 24, delay = 0 } = params ?? {};

	gsap.set(node, { opacity: 0, y });
	const tween = gsap.to(node, {
		opacity: 1,
		y: 0,
		duration: 0.7,
		delay,
		ease: 'power3.out',
		scrollTrigger: { trigger: node, start: 'top 88%', once: true }
	});

	return { destroy: () => tween.scrollTrigger?.kill() };
};

/** Stagger the element's direct children in as it enters view. */
export const revealStagger: Action<HTMLElement, { each?: number; y?: number } | undefined> = (
	node,
	params
) => {
	if (reduced()) return;
	const { each = 0.08, y = 20 } = params ?? {};
	const kids = Array.from(node.children) as HTMLElement[];
	if (!kids.length) return;

	gsap.set(kids, { opacity: 0, y });
	const tween = gsap.to(kids, {
		opacity: 1,
		y: 0,
		duration: 0.6,
		ease: 'power3.out',
		stagger: each,
		scrollTrigger: { trigger: node, start: 'top 85%', once: true }
	});

	return { destroy: () => tween.scrollTrigger?.kill() };
};

/**
 * Count a numeric readout up to its final value — the classic HUD tick.
 * Non-numeric values (e.g. "∞") are left alone; the prefix/suffix around the
 * digits ("50+", "9.4K") is preserved.
 */
export const countUp: Action<HTMLElement, string | undefined> = (node, value) => {
	const raw = value ?? node.textContent ?? '';
	const match = raw.match(/^(\D*)(\d[\d.,]*)(.*)$/);
	if (reduced() || !match) return;

	const [, prefix, digits, suffix] = match;
	const target = Number(digits.replace(/,/g, ''));
	if (!Number.isFinite(target)) return;

	const pad = digits.startsWith('0') ? digits.length : 0;
	const counter = { n: 0 };

	node.textContent = `${prefix}${'0'.padStart(pad, '0')}${suffix}`;
	const tween = gsap.to(counter, {
		n: target,
		duration: 1.4,
		ease: 'power2.out',
		snap: { n: 1 },
		scrollTrigger: { trigger: node, start: 'top 92%', once: true },
		onUpdate: () => {
			const shown = pad
				? String(Math.round(counter.n)).padStart(pad, '0')
				: String(Math.round(counter.n));
			node.textContent = `${prefix}${shown}${suffix}`;
		},
		onComplete: () => {
			node.textContent = raw;
		}
	});

	return { destroy: () => tween.scrollTrigger?.kill() };
};

/** Type a line out character by character, terminal style. */
export const typewriter: Action<HTMLElement, { speed?: number } | undefined> = (node, params) => {
	const full = node.textContent ?? '';
	if (reduced() || !full) return;
	const { speed = 0.018 } = params ?? {};

	node.textContent = '';
	node.classList.add('caret');
	const state = { i: 0 };

	const tween = gsap.to(state, {
		i: full.length,
		duration: full.length * speed,
		ease: 'none',
		scrollTrigger: { trigger: node, start: 'top 92%', once: true },
		onUpdate: () => {
			node.textContent = full.slice(0, Math.round(state.i));
		},
		onComplete: () => {
			node.textContent = full;
			node.classList.remove('caret');
		}
	});

	return { destroy: () => tween.scrollTrigger?.kill() };
};

/**
 * Hero entrance — runs once on mount, no scroll trigger. Returns the timeline
 * so the caller can await or kill it.
 */
export function heroIntro(root: HTMLElement) {
	if (reduced()) return null;

	const q = gsap.utils.selector(root);
	const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

	// On phones the entrance slides along Y, not X.
	//
	// `gsap.from` starts the element at the offset and animates to zero, so an
	// x-offset places it outside its own box for the length of the tween. At
	// 375px the panel's 24px start offset put its right edge 8px beyond the
	// viewport, which is enough for mobile Safari to let the page pan sideways
	// — `overflow-x` on the root suppresses the scrollbar but is not something
	// to rely on for touch panning. Sliding vertically overflows nothing,
	// because the page already scrolls on that axis.
	//
	// Desktop keeps the horizontal slide: there the panel sits in a 12-column
	// grid with room to spare, so 24px never reaches the viewport edge.
	const slideOnX = !window.matchMedia('(max-width: 767px)').matches;
	const enter = (x: number, y = x) => (slideOnX ? { x } : { y });

	tl.from(q('[data-hero="status"]'), { opacity: 0, ...enter(-16), duration: 0.5 })
		.from(q('[data-hero="title"]'), { opacity: 0, y: 28, duration: 0.7 }, '-=0.25')
		.from(q('[data-hero="copy"]'), { opacity: 0, y: 18, duration: 0.6 }, '-=0.4')
		.from(q('[data-hero="cta"] > *'), { opacity: 0, y: 14, duration: 0.45, stagger: 0.1 }, '-=0.35')
		.from(
			q('[data-hero="social"] > *'),
			{ opacity: 0, y: 10, duration: 0.4, stagger: 0.07 },
			'-=0.3'
		)
		.from(q('[data-hero="panel"]'), { opacity: 0, ...enter(24), duration: 0.7 }, '-=0.9')
		.from(
			q('[data-hero="row"]'),
			{ opacity: 0, ...enter(12), duration: 0.35, stagger: 0.05 },
			'-=0.4'
		);

	return tl;
}

export { gsap, ScrollTrigger };
