// Password recovery: mail the account a temporary password.
//
// The shape is deliberately the plainest one that works — a new random password
// is generated, stored hashed, and sent to the address on the account. There is
// no reset link and no token table, which means nothing new to expire, revoke
// or leak in a URL; the cost is that a working credential travels through
// email, so the password is marked temporary and MUST be replaced at the next
// sign-in (see mustChangePassword in the hooks).
//
// Two rules this route follows without exception:
//
//   1. The answer is always the same. Whether the account exists, has no email,
//      is dormant, or the mail provider failed — the browser is told the same
//      sentence. Anything else turns this form into a directory of which
//      usernames and addresses are real.
//   2. Failures are LOGGED, not shown. The operator needs to know Mailgun
//      rejected a message; the person at the form must not learn anything.

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { issueTemporaryPassword } from '$lib/server/users';
import { mailConfigured, sendMail } from '$lib/server/mail';

/**
 * Attempt throttle, per IP and per identifier.
 *
 * Rate limiting matters more here than on the login form: every accepted
 * request REPLACES someone's password, so an unthrottled endpoint lets a
 * stranger lock an admin out of their own panel repeatedly, and floods the
 * sending domain's reputation while doing it.
 *
 * In-process, like the login throttle — a single replica, and a restart
 * clearing it is acceptable for this threat.
 */
const HOUR = 60 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_PER_ACCOUNT = 3;

type Bucket = { count: number; until: number };
const byIp = new Map<string, Bucket>();
const byAccount = new Map<string, Bucket>();

function overLimit(map: Map<string, Bucket>, key: string, max: number): boolean {
	const now = Date.now();
	const rec = map.get(key);
	if (!rec || now > rec.until) {
		map.set(key, { count: 1, until: now + HOUR });
		return false;
	}
	rec.count += 1;
	return rec.count > max;
}

export const load: PageServerLoad = async () => ({
	// Shown as a warning to whoever opens the page: without Mailgun there is
	// nothing this form can do, and saying so beats a silent no-op.
	mailReady: mailConfigured()
});

const SAME_ANSWER = {
	sent: true,
	message: 'If that account exists and has an email on file, a temporary password is on its way.'
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const identifier = String(form.get('identifier') ?? '').trim();

		if (!identifier) return fail(400, { message: 'Enter your username or email.' });

		const ip = getClientAddress();
		if (
			overLimit(byIp, ip, MAX_PER_IP) ||
			overLimit(byAccount, identifier.toLowerCase(), MAX_PER_ACCOUNT)
		) {
			// The one case with a different answer, and it leaks nothing: it is
			// about this caller's behaviour, not about whether the account exists.
			return fail(429, { message: 'Too many recovery attempts. Try again later.' });
		}

		if (!mailConfigured()) {
			console.error('[recover] Mailgun is not configured — no message can be sent');
			return SAME_ANSWER;
		}

		let issued;
		try {
			issued = await issueTemporaryPassword(identifier);
		} catch (e) {
			console.error('[recover] could not issue a temporary password:', e);
			return SAME_ANSWER;
		}

		// No such account, no address on file, or a dormant account. Nothing to
		// send, and the caller is told exactly what everyone else is told.
		if (!issued) return SAME_ANSWER;

		try {
			await sendMail({
				to: issued.email,
				subject: 'Your temporary admin password',
				text: [
					`A password reset was requested for ${issued.username}.`,
					'',
					`Temporary password: ${issued.password}`,
					'',
					'Sign in with it at https://pablocabrera.dev/admin/login — you will be asked',
					'to choose a new password straight away, and this one stops working then.',
					'',
					'Every other session for this account has been signed out.',
					'',
					'If this was not you, sign in and change the password now: whoever asked',
					'for this reset cannot read this message, but the old password is gone.'
				].join('\n')
			});
		} catch (e) {
			// The password HAS been changed at this point. Saying "email failed"
			// would tell a stranger the account is real, so the operator learns
			// it from the log and the user is told what everyone is told.
			console.error('[recover] Mailgun send failed for an existing account:', e);
		}

		return SAME_ANSWER;
	}
};
