// See https://svelte.dev/docs/kit/types#app.d.ts
import type { AdminSession } from '$lib/server/auth';
import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			/** Resolved admin identity for this request, or null when signed out. */
			session: AdminSession | null;
			/**
			 * Absolute end of the signed-in session — the moment refreshing stops
			 * working and the user is signed out regardless of activity. Present
			 * only when `session` is, and only once a refresh has been redeemed
			 * this request (the access token alone does not carry it).
			 */
			sessionExpiresAt: Date | null;
			/** Locale resolved for this request: ?lang=, then cookie, then header. */
			locale: Locale;
		}
		// interface Error {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
