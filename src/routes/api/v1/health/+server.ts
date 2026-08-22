import { json } from '@sveltejs/kit';
import { pingDb } from '$lib/server/db';

export const GET = async () => {
	const dbOk = await pingDb();
	return json(
		{
			status: dbOk ? 'healthy' : 'degraded',
			db: dbOk,
			timestamp: new Date().toISOString()
		},
		{ status: dbOk ? 200 : 503 }
	);
};
