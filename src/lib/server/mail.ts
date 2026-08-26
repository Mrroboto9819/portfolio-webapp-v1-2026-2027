// Outbound email, through Mailgun's HTTP API.
//
// A plain fetch() against the Messages endpoint rather than the mailgun.js SDK:
// the whole integration is one form-encoded POST with basic auth, the SDK would
// add a dependency tree to save four lines, and fetch behaves identically under
// Bun and Node — which matters because the k3s image and the EC2 image run the
// same code.
//
// Configuration is environment, like every other secret in this app:
//
//   MAILGUN_API_KEY    private API key ("key-…" / a signing key from the panel)
//   MAILGUN_DOMAIN     the sending domain, e.g. mg.pablocabrera.dev
//   MAILGUN_FROM       From header, e.g. "Portafolio <no-reply@mg.pablocabrera.dev>"
//   MAILGUN_BASE_URL   optional; set to https://api.eu.mailgun.net for an EU domain
//
// On AWS these are SSM parameters directly under the app's prefix (the boot
// script turns every parameter there into one env line). On k3s they are keys
// in the app's Secret. Nothing here is baked into an image.

import { env } from '$env/dynamic/private';

/** US by default; an EU-region Mailgun domain answers on a different host. */
const DEFAULT_BASE = 'https://api.mailgun.net';

export function mailConfigured(): boolean {
	return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN && env.MAILGUN_FROM);
}

export type Mail = {
	to: string;
	subject: string;
	text: string;
};

/**
 * Send one message.
 *
 * Throws on a missing configuration or a non-2xx from Mailgun, with the body
 * included: Mailgun answers a wrong domain or an unauthorised sender with a
 * perfectly readable message, and swallowing it would turn every failure into
 * the same silent nothing.
 *
 * The caller decides what the USER is told — see the recovery action, which
 * deliberately reports the same thing whether or not a message went out.
 */
export async function sendMail(mail: Mail): Promise<void> {
	if (!mailConfigured()) {
		throw new Error('Mailgun is not configured (MAILGUN_API_KEY / _DOMAIN / _FROM)');
	}

	const base = (env.MAILGUN_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
	const url = `${base}/v3/${env.MAILGUN_DOMAIN}/messages`;

	const body = new URLSearchParams({
		from: env.MAILGUN_FROM!,
		to: mail.to,
		subject: mail.subject,
		text: mail.text
	});

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			// Mailgun's basic auth is the literal user "api" plus the key.
			Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body,
		// A hung SMTP provider must not hold a form action open forever.
		signal: AbortSignal.timeout(15_000)
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Mailgun refused the message (${res.status}): ${detail.slice(0, 300)}`);
	}
}
