// Official brand colours for the technology marks in static/icons/.
//
// Those files are monochrome silhouettes (simple-icons style): most carry no
// fill at all and a few hardcode #1c1f21, so painted as-authored they are
// invisible on a dark ground. Rendering them through a CSS mask lets us paint
// them — and the colour to paint them is the brand's own, not a UI accent.
//
// `onDark` exists because a handful of official colours are near-black and
// unreadable here (Next.js #000000, Flask #000000, Django #092E20, GitHub
// #181717). For those the brand's own lighter mark colour is used, or white.

type Brand = { color: string; onDark?: string };

const BRANDS: Record<string, Brand> = {
	JAVASCRIPT: { color: '#F7DF1E' },
	TYPESCRIPT: { color: '#3178C6' },
	'VUE.JS': { color: '#4FC08D' },
	VUE3: { color: '#4FC08D' },
	REACT: { color: '#61DAFB' },
	'REACT NATIVE': { color: '#61DAFB' },
	NEXT: { color: '#000000', onDark: '#FFFFFF' },
	'NEXT.JS': { color: '#000000', onDark: '#FFFFFF' },
	NUXT: { color: '#00DC82' },
	'NODE.JS': { color: '#5FA04E' },
	PYTHON: { color: '#3776AB', onDark: '#4B8BBE' },
	FLASK: { color: '#000000', onDark: '#FFFFFF' },
	DJANGO: { color: '#092E20', onDark: '#44B78B' },
	MYSQL: { color: '#4479A1', onDark: '#5D9CC8' },
	MONGODB: { color: '#47A248' },
	DOCKER: { color: '#2496ED' },
	PHP: { color: '#777BB4' },
	NESTJS: { color: '#E0234E' },
	WORDPRESS: { color: '#21759B', onDark: '#3A9BC1' },
	TAILWINDCSS: { color: '#06B6D4' },
	SVELTE: { color: '#FF3E00' },
	SVELTEKIT: { color: '#FF3E00' },
	TAURI: { color: '#FFC131' },
	STRIPE: { color: '#635BFF' },
	GITHUB: { color: '#181717', onDark: '#FFFFFF' },
	LINKEDIN: { color: '#0A66C2', onDark: '#3E93DA' },
	EMAIL: { color: '#EA4335' },

	// --- added from the full stack list ---
	SASS: { color: '#CC6699' },
	PUG: { color: '#A86454' },
	EXPRESS: { color: '#000000', onDark: '#FFFFFF' },
	FASTAPI: { color: '#009688' },
	'.NET': { color: '#512BD4', onDark: '#7B5BE8' },
	DOTNET: { color: '#512BD4', onDark: '#7B5BE8' },
	ELECTRON: { color: '#47848F', onDark: '#5FA7B4' },
	POSTGRESQL: { color: '#4169E1', onDark: '#6C8CEA' },
	'GITHUB ACTIONS': { color: '#2088FF' },
	GITHUBACTIONS: { color: '#2088FF' },
	JENKINS: { color: '#D24939' },
	KUBERNETES: { color: '#326CE5', onDark: '#5A8EEE' },
	K3S: { color: '#FFC61C' },
	'DOCKER COMPOSE': { color: '#2496ED' },
	LINUX: { color: '#FCC624' },
	WINDOWS: { color: '#0078D4', onDark: '#3B9BE8' },
	FIGMA: { color: '#F24E1E' },
	PHOTOSHOP: { color: '#31A8FF' },
	RUST: { color: '#000000', onDark: '#FF7043' },
	GIT: { color: '#F05032' },
	INSTAGRAM: { color: '#E4405F' },
	REDIS: { color: '#FF4438' },
	NGINX: { color: '#009639' },

	// --- production platform (see $lib/stack.ts) ---
	// AWS's own orange reads well on the dark ground, so no onDark override is
	// needed for the umbrella mark or EC2. S3's official green is the darker
	// #569A31 from the service icon; lifted here for the same reason Django is.
	TERRAFORM: { color: '#844FBA', onDark: '#A47FD0' },
	AWS: { color: '#FF9900' },
	'AMAZON EC2': { color: '#FF9900' },
	'AMAZON S3': { color: '#569A31', onDark: '#7CBF52' },
	'MONGODB ATLAS': { color: '#47A248' }
};

/**
 * Brand colour for a technology or platform name, chosen for legibility on the
 * dark ground. Returns null when the mark has no brand colour of its own — the
 * caller then decides (a UI accent is a reasonable fallback).
 */
export function brandColor(name: string | undefined): string | null {
	if (!name) return null;
	const b = BRANDS[name.trim().toUpperCase()];
	if (!b) return null;
	return b.onDark ?? b.color;
}
