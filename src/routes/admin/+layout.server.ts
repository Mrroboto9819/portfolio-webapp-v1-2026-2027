import type { LayoutServerLoad } from './$types';
import { profile, songs } from '$lib/server/repositories';

// hooks.server.ts already redirects unauthenticated requests away from /admin,
// so a session is guaranteed here for every page except the login route.
export const load: LayoutServerLoad = async ({ locals }) => ({
	session: locals.session,
	// Every admin screen localises its own copy against this, the same locale
	// the public site resolved for the request.
	locale: locals.locale,
	// The sidebar shows the profile name and avatar rather than the login
	// address: an email is long enough to overflow a 240px rail, and it is
	// not what the operator calls themselves anyway.
	profile: await profile.get(),
	// The queue behind the bottom transport, so a track keeps playing (and keeps
	// showing) while its owner moves around the admin. Hidden rows included:
	// this is the library, and auditioning something before publishing it is the
	// whole point of the workflow.
	songs: await songs.list({ activeOnly: false })
});
