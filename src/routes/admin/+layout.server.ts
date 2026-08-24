import type { LayoutServerLoad } from './$types';
import { profile } from '$lib/server/repositories';

// hooks.server.ts already redirects unauthenticated requests away from /admin,
// so a session is guaranteed here for every page except the login route.
export const load: LayoutServerLoad = async ({ locals }) => ({
	session: locals.session,
	// The sidebar shows the profile name and avatar rather than the login
	// address: an email is long enough to overflow a 240px rail, and it is
	// not what the operator calls themselves anyway.
	profile: await profile.get()
});
