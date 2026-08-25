import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// adapter-node: the container runs `node build/index.js` on $PORT.
		adapter: adapter({ out: 'build' }),

		// Content-Security-Policy.
		//
		// This site renders MARKDOWN AUTHORED IN THE ADMIN as HTML. That pass is
		// sanitised server-side (src/lib/server/markdown.ts) and is the primary
		// defence — but a sanitiser is one bug away from being bypassed, and a
		// CSP is the layer that makes such a bug non-exploitable rather than
		// catastrophic. It is defence in depth, not a replacement.
		//
		// `mode: 'auto'` lets SvelteKit hash or nonce its own inline hydration
		// script, which is why 'unsafe-inline' is NOT needed for script-src.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// No 'unsafe-inline' and no 'unsafe-eval': every script on the page
				// is either a built module from /_app or SvelteKit's own bootstrap.
				'script-src': ['self'],
				// Google Fonts serves the stylesheet; the rest is Tailwind's built
				// sheet. 'unsafe-inline' here covers Svelte's scoped <style> blocks.
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				// Separate from style-src on purpose: the components set style="..."
				// attributes (the equaliser bars, the seek handle, the pixel icons),
				// which style-src does not cover and which cannot carry a nonce.
				'style-src-attr': ['unsafe-inline'],
				'font-src': ['self', 'https://fonts.gstatic.com', 'data:'],
				// Uploads are served same-origin under /cdn, so 'self' covers them.
				'img-src': ['self', 'data:', 'blob:'],
				'media-src': ['self'],
				'connect-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				// Nothing on this site is meant to be framed, so clickjacking has
				// no surface at all.
				//
				// Deliberately NO 'upgrade-insecure-requests': the dev server runs
				// on plain http over a LAN address, where that directive rewrites
				// its own asset requests to https and breaks the page. TLS is
				// terminated at the edge, and HSTS (set in hooks) is what upgrades
				// a real visitor.
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
