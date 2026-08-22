// MongoDB singleton.
// SOLID note (Single Responsibility): this module's only job is to hand out
// a Db handle on demand. Nothing else — no schemas, no routes, no business
// logic. Every other server-side module that needs Mongo goes through here.
//
// SOLID note (Dependency Inversion): consumers depend on the abstract
// `getDb(): Promise<Db>` function, not on the underlying MongoClient instance.
// Swapping driver / pool config / mock-for-tests touches only this file.

import { MongoClient, type Db } from 'mongodb';
import { env } from '$env/dynamic/private';

// Cache on globalThis so the singleton survives Vite/SvelteKit module
// reloads in dev. One pool per Node/Bun process.
const KEY = '__portafolio_mongo__';
type Cache = { client: MongoClient; db: Db; ready: Promise<Db> } | null;

function cache(): { value: Cache } {
	const g = globalThis as typeof globalThis & { [KEY]?: { value: Cache } };
	if (!g[KEY]) g[KEY] = { value: null };
	return g[KEY]!;
}

export async function getDb(): Promise<Db> {
	const c = cache();
	if (c.value) return c.value.ready;

	const uri = env.MONGODB_URI;
	if (!uri) throw new Error('MONGODB_URI is not set');
	const dbName = env.MONGODB_DB || 'portafolio';

	const client = new MongoClient(uri, {
		maxPoolSize: 20,
		serverSelectionTimeoutMS: 5000
	});

	const ready = client.connect().then(() => client.db(dbName));
	c.value = { client, db: null as unknown as Db, ready };
	const db = await ready;
	c.value.db = db;
	return db;
}

// Health probe — returns true if Mongo is reachable.
export async function pingDb(): Promise<boolean> {
	try {
		const db = await getDb();
		await db.command({ ping: 1 });
		return true;
	} catch {
		return false;
	}
}
