// HTTP client.
//
// Two instances, deliberately:
//
//   publicApi — the open read endpoints (/api/v1/<entity>, health). No auth,
//               no session handling, and a failure is not a reason to bounce
//               anyone to a login screen.
//   adminApi  — everything behind the session. A 401 here means the session
//               actually expired, so it redirects to the login and carries the
//               current path so the user comes back where they were.
//
// One shared instance could not do both: it would either redirect a visitor
// off the public site on an unrelated blip, or swallow a real expiry.

import axios, { AxiosError, type AxiosInstance } from 'axios';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { apiMessage, DEFAULT_LOCALE, isLocale, type Locale } from '$lib/i18n';
import { toast } from '$lib/toast.svelte';

const BASE = '/api/v1';

/** Locale for THIS request: the ?lang= pin first, then the cookie. */
export function currentLocale(): Locale {
	if (!browser) return DEFAULT_LOCALE;
	const fromUrl = new URLSearchParams(location.search).get('lang');
	if (isLocale(fromUrl)) return fromUrl;
	const m = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
	return isLocale(m?.[1]) ? (m![1] as Locale) : DEFAULT_LOCALE;
}

function attachLocale(client: AxiosInstance) {
	client.interceptors.request.use((config) => {
		// The server localises its own messages from this header, so an error
		// comes back already in the reader's language.
		config.headers.set('Accept-Language', currentLocale());
		return config;
	});
}

/** Pull the best message out of a response, falling back to a localised default. */
export function messageFrom(err: unknown, fallbackKey = 'api.serverError'): string {
	const locale = currentLocale();
	if (err instanceof AxiosError) {
		if (err.response) {
			const data = err.response.data as { message?: string } | undefined;
			if (data?.message) return data.message;
			if (err.response.status === 401) return apiMessage('api.unauthorized', locale);
			if (err.response.status === 403) return apiMessage('api.forbidden', locale);
			if (err.response.status === 404) return apiMessage('api.notFound', locale);
		} else {
			return apiMessage('api.network', locale);
		}
	}
	if (err instanceof Error && err.message) return err.message;
	return apiMessage(fallbackKey, locale);
}

// ---- public ----------------------------------------------------------------
export const publicApi = axios.create({ baseURL: BASE, timeout: 15000 });
attachLocale(publicApi);

// ---- admin -----------------------------------------------------------------
export const adminApi = axios.create({
	baseURL: BASE,
	timeout: 60000, // uploads are slow; a 15s cap would kill a legitimate one
	withCredentials: true
});
attachLocale(adminApi);

let redirecting = false;

adminApi.interceptors.response.use(
	(res) => res,
	async (err: AxiosError) => {
		const status = err.response?.status;

		// 401 is a genuinely expired session. 403 is "signed in but not allowed",
		// which must NOT bounce anyone — that would loop a read-only user.
		if (status === 401 && browser && !redirecting) {
			redirecting = true;
			toast.warning(messageFrom(err, 'api.unauthorized'));
			const next = encodeURIComponent(location.pathname + location.search);
			await goto(`/admin/login?next=${next}`, { invalidateAll: true });
			redirecting = false;
		}

		return Promise.reject(err);
	}
);

/**
 * Run a request, surface the outcome as a toast, and hand back the data.
 * Returns null on failure rather than throwing, so callers stay flat.
 */
export async function call<T>(
	fn: () => Promise<{ data: T }>,
	opts: { success?: string; silent?: boolean } = {}
): Promise<T | null> {
	try {
		const { data } = await fn();
		if (opts.success) toast.success(opts.success);
		return data;
	} catch (err) {
		if (!opts.silent) toast.error(messageFrom(err));
		return null;
	}
}
