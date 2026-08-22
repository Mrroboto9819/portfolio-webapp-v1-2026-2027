import type { LayoutServerLoad } from './$types';

// hooks.server.ts already redirects unauthenticated requests away from /admin,
// so a session is guaranteed here for every page except the login route.
export const load: LayoutServerLoad = async ({ locals }) => ({ session: locals.session });
