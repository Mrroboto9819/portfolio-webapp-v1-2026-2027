// Generic repository for content collections.
//
// SOLID:
//   * Single Responsibility — this module owns *only* CRUD against one Mongo
//     collection. No HTTP shaping, no validation, no auth.
//   * Open/Closed — `Repository<E>` is extended by entity classes when a
//     collection needs custom queries (e.g. `SkillRepo.byGroup(...)`).
//   * Interface Segregation — `Listable` / `Mutable` below let a route receive
//     only the methods it actually uses.
//   * Dependency Inversion — depends on the abstract `getDb()`, not on a
//     concrete MongoClient. Swappable for in-memory tests.
//
// TYPING NOTE (this bit is load-bearing):
// The repository is parameterised by the WIRE entity (`Company`, `Skill`, …),
// never by the server-side document shape. An earlier version used
// `Repository<T extends Document & {...}>` and derived the wire type with
// `Omit<T, '_id' | 'createdAt' | 'updatedAt'>`. That silently erased every
// field: mongodb's `Document` carries `[key: string]: any`, so `keyof T`
// widens to `string | number`, `Exclude` removes nothing, and the resulting
// `Pick` is a bare index signature. Consumers still compiled — they just got
// `any` for every property. Keeping `Document` out of the public generic is
// what makes `data.companies[0].role` actually type-check.

import { ObjectId, type Collection, type Document, type Filter, type WithId } from 'mongodb';
import { getDb } from './db';
import type { BaseDoc } from '$lib/types';

// Server-side fields every content document carries, on top of its entity
// fields. Internal to this module — it never reaches a route.
type ServerFields = {
	_id: ObjectId;
	order: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type Paged<E> = {
	items: E[];
	total: number;
	page: number;
	perPage: number;
	pages: number;
};

// Read-only surface — handed to public list endpoints.
export interface Listable<E> {
	list(opts?: { activeOnly?: boolean }): Promise<E[]>;
	findById(id: string): Promise<E | null>;
}

// Read+write surface — handed to admin-only endpoints.
export interface Mutable<E> extends Listable<E> {
	create(body: Partial<E>): Promise<E>;
	update(id: string, body: Partial<E>): Promise<E | null>;
	remove(id: string): Promise<boolean>;
}

export class Repository<E extends BaseDoc> implements Mutable<E> {
	constructor(public readonly collectionName: string) {}

	// Cached collection handle — index creation is idempotent but we don't want
	// to call it on every query.
	private _col: Collection<Document> | null = null;
	protected async col(): Promise<Collection<Document>> {
		if (this._col) return this._col;
		const db = await getDb();
		const c = db.collection<Document>(this.collectionName);
		await c.createIndex({ order: 1 });
		this._col = c;
		return c;
	}

	// Wire-shape: ObjectId → string id, Dates → ISO strings.
	protected shape(doc: WithId<Document>): E {
		const { _id, createdAt, updatedAt, ...rest } = doc as WithId<Document> & Partial<ServerFields>;
		return {
			...rest,
			id: _id.toString(),
			createdAt: createdAt instanceof Date ? createdAt.toISOString() : undefined,
			updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : undefined
		} as E;
	}

	async list(opts: { activeOnly?: boolean } = {}): Promise<E[]> {
		const col = await this.col();
		const filter: Filter<Document> = opts.activeOnly ? { isActive: { $ne: false } } : {};
		const docs = await col.find(filter, { sort: { order: 1, _id: 1 } }).toArray();
		return docs.map((d) => this.shape(d));
	}

	/**
	 * Page through a collection.
	 *
	 * Counting and slicing happen in Mongo, not in the caller: fetching every
	 * document to slice it in JS works only while collections are small and
	 * silently becomes the slowest thing on the page once they are not.
	 */
	async paginate(
		opts: {
			page?: number;
			perPage?: number;
			sort?: string;
			dir?: 'asc' | 'desc';
			activeOnly?: boolean;
			search?: string;
			searchFields?: string[];
		} = {}
	): Promise<Paged<E>> {
		const perPage = Math.min(Math.max(opts.perPage ?? 20, 1), 100);
		const col = await this.col();

		const filter: Filter<Document> = opts.activeOnly ? { isActive: { $ne: false } } : {};

		// Case-insensitive contains across the named fields. The term is escaped
		// so a user typing `.` or `(` searches for that character instead of
		// injecting a regex (or a catastrophically backtracking one).
		const term = opts.search?.trim();
		if (term && opts.searchFields?.length) {
			const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			filter.$or = opts.searchFields.map((f) => ({ [f]: { $regex: escaped, $options: 'i' } }));
		}

		const total = await col.countDocuments(filter);
		const pages = Math.max(1, Math.ceil(total / perPage));
		// Clamp rather than return an empty page when the caller asks for a page
		// past the end — e.g. after deleting the last row on page 3.
		const page = Math.min(Math.max(opts.page ?? 1, 1), pages);

		const sortField = opts.sort || 'order';
		const sortDir = opts.dir === 'desc' ? -1 : 1;

		const docs = await col
			.find(filter, {
				sort: { [sortField]: sortDir, _id: 1 },
				skip: (page - 1) * perPage,
				limit: perPage
			})
			.toArray();

		return { items: docs.map((d) => this.shape(d)), total, page, perPage, pages };
	}

	async findById(id: string): Promise<E | null> {
		if (!ObjectId.isValid(id)) return null;
		const col = await this.col();
		const doc = await col.findOne({ _id: new ObjectId(id) });
		return doc ? this.shape(doc) : null;
	}

	async create(body: Partial<E>): Promise<E> {
		const col = await this.col();
		const now = new Date();

		// Auto-append to end if no order specified.
		let order = (body as { order?: number }).order;
		if (typeof order !== 'number') {
			const last = await col.find({}, { sort: { order: -1 }, limit: 1 }).toArray();
			order = last.length ? ((last[0] as { order?: number }).order ?? 0) + 1 : 0;
		}

		const doc = {
			isActive: true,
			...body,
			_id: new ObjectId(),
			order,
			createdAt: now,
			updatedAt: now
		} as unknown as WithId<Document>;

		await col.insertOne(doc);
		return this.shape(doc);
	}

	async update(id: string, body: Partial<E>): Promise<E | null> {
		if (!ObjectId.isValid(id)) return null;
		const col = await this.col();

		// Strip immutable / server-controlled fields from the incoming patch.
		const {
			_id: _omitId,
			id: _omitIdStr,
			createdAt: _omitCreated,
			updatedAt: _omitUpdated,
			...patch
		} = body as Record<string, unknown>;

		const result = await col.findOneAndUpdate(
			{ _id: new ObjectId(id) },
			{ $set: { ...patch, updatedAt: new Date() } },
			{ returnDocument: 'after' }
		);
		return result ? this.shape(result) : null;
	}

	async remove(id: string): Promise<boolean> {
		if (!ObjectId.isValid(id)) return false;
		const col = await this.col();
		const r = await col.deleteOne({ _id: new ObjectId(id) });
		return r.deletedCount > 0;
	}
}
