import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// adapter-node: the container runs `node build/index.js` on $PORT.
		adapter: adapter({ out: 'build' })
	}
};

export default config;
