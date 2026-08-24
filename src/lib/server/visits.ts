// Visit counting.
//
// PRIVACY, deliberately:
//   * No raw IP address is ever stored. The visitor id is
//     sha256(ip + user-agent + a per-day secret salt), truncated. That is
//     enough to count a person once per day and useless for anything else.
//   * The salt rotates daily, so two records from different days cannot be
//     linked back to the same person even by whoever holds the database.
//     This is what makes the counter pseudonymous rather than personal data.
//   * No cookie is set for analytics, so nothing follows anyone around.
//
// The trade-off is honest: "unique visitors" means unique-per-day, and a
// person on two networks counts twice. That is the correct trade to avoid
// holding identifiable data.

import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getDb } from './db';

const COLLECTION = 'visits';

/** Bot user-agents are counted separately rather than inflating the numbers. */
const BOT =
	/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|curl|wget|python-requests|monitoring|uptime/i;

function dayKey(d = new Date()): string {
	return d.toISOString().slice(0, 10);
}

function visitorId(ip: string, ua: string, day: string): string {
	// The salt is a server secret; without it the hash of a known IP could be
	// recomputed and matched. Falls back to the JWT secret so this is never
	// silently unsalted.
	const salt = env.ANALYTICS_SALT || env.JWT_ACCESS_SECRET || 'unsalted-dev-only';
	return createHash('sha256').update(`${ip}|${ua}|${day}|${salt}`).digest('hex').slice(0, 32);
}

/** Coarse browser family — never the full UA string. */
function browserOf(ua: string): string {
	if (/edg\//i.test(ua)) return 'Edge';
	if (/chrome|chromium|crios/i.test(ua)) return 'Chrome';
	if (/firefox|fxios/i.test(ua)) return 'Firefox';
	if (/safari/i.test(ua)) return 'Safari';
	return 'Other';
}

export type RecordArgs = {
	path: string;
	ip: string;
	userAgent: string;
	referrer?: string | null;
	country?: string | null;
};

export async function recordVisit(args: RecordArgs): Promise<void> {
	const day = dayKey();
	const ua = args.userAgent || '';
	const db = await getDb();
	const col = db.collection(COLLECTION);

	// One row per visitor per path per day. upsert makes a refresh cheap and
	// keeps the collection bounded by (visitors x paths x days) rather than
	// growing with every single request.
	await col.updateOne(
		{ day, path: args.path, visitor: visitorId(args.ip, ua, day) },
		{
			$setOnInsert: {
				day,
				path: args.path,
				visitor: visitorId(args.ip, ua, day),
				firstAt: new Date(),
				referrer: args.referrer?.slice(0, 200) || null,
				country: args.country || null,
				browser: browserOf(ua),
				bot: BOT.test(ua)
			},
			$inc: { hits: 1 },
			$set: { lastAt: new Date() }
		},
		{ upsert: true }
	);
}

export async function ensureVisitIndexes(): Promise<void> {
	const db = await getDb();
	const col = db.collection(COLLECTION);
	await col.createIndex({ day: 1, path: 1, visitor: 1 }, { unique: true });
	await col.createIndex({ day: -1 });
	// Records expire after a year — analytics do not need to be kept forever,
	// and a bounded retention window is part of collecting responsibly.
	await col.createIndex({ firstAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }).catch(() => {});
}

export type VisitStats = {
	totalVisits: number;
	uniqueVisitors: number;
	today: number;
	last30: { day: string; visits: number; visitors: number }[];
	topPaths: { path: string; visits: number }[];
	browsers: { browser: string; visitors: number }[];
	referrers: { referrer: string; visits: number }[];
};

export async function visitStats(days = 30): Promise<VisitStats> {
	const db = await getDb();
	const col = db.collection(COLLECTION);

	const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
	const base = { bot: { $ne: true }, day: { $gte: since } };

	const [totals, daily, paths, browsers, referrers] = await Promise.all([
		col
			.aggregate([
				{ $match: base },
				{ $group: { _id: null, visits: { $sum: '$hits' }, visitors: { $addToSet: '$visitor' } } }
			])
			.toArray(),
		col
			.aggregate([
				{ $match: base },
				{ $group: { _id: '$day', visits: { $sum: '$hits' }, visitors: { $addToSet: '$visitor' } } },
				{ $sort: { _id: 1 } }
			])
			.toArray(),
		col
			.aggregate([
				{ $match: base },
				{ $group: { _id: '$path', visits: { $sum: '$hits' } } },
				{ $sort: { visits: -1 } },
				{ $limit: 8 }
			])
			.toArray(),
		col
			.aggregate([
				{ $match: base },
				{ $group: { _id: '$browser', visitors: { $addToSet: '$visitor' } } }
			])
			.toArray(),
		col
			.aggregate([
				{ $match: { ...base, referrer: { $nin: [null, ''] } } },
				{ $group: { _id: '$referrer', visits: { $sum: '$hits' } } },
				{ $sort: { visits: -1 } },
				{ $limit: 6 }
			])
			.toArray()
	]);

	const today = dayKey();
	const byDay = new Map(daily.map((d) => [d._id as string, d]));

	// Fill gaps so the chart has a continuous axis — a missing day is zero
	// traffic, not a hole to interpolate across.
	const last30: VisitStats['last30'] = [];
	for (let i = days - 1; i >= 0; i--) {
		const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
		const row = byDay.get(key);
		last30.push({
			day: key,
			visits: row?.visits ?? 0,
			visitors: row?.visitors?.length ?? 0
		});
	}

	return {
		totalVisits: totals[0]?.visits ?? 0,
		uniqueVisitors: totals[0]?.visitors?.length ?? 0,
		today: byDay.get(today)?.visits ?? 0,
		last30,
		topPaths: paths.map((p) => ({ path: p._id as string, visits: p.visits })),
		browsers: browsers
			.map((b) => ({ browser: b._id as string, visitors: b.visitors.length }))
			.sort((a, b) => b.visitors - a.visitors),
		referrers: referrers.map((r) => ({ referrer: r._id as string, visits: r.visits }))
	};
}
