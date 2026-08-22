// See https://svelte.dev/docs/kit/types#app.d.ts
import type { AdminSession } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			session: AdminSession | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
