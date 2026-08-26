// One concrete repository per content collection + a name→repo registry.
//
// SOLID note (Open/Closed): each entity gets its own subclass when it needs
// custom queries. For now everything uses the default `Repository<E>` —
// `SkillRepo` / `ProjectRepo` etc. can extend later (e.g. `byGroup(g)`,
// `featured()`) without touching the base.

import type { Document, Filter, WithId } from 'mongodb';
import { Repository, type Paged } from './repository';
import type {
	BaseDoc,
	Company,
	Credential,
	EntityName,
	Extra,
	Issuer,
	MetaEntry,
	Post,
	Profile,
	Section,
	Project,
	Skill,
	Social,
	Song,
	Stat
} from '$lib/types';

class CompanyRepo extends Repository<Company> {}
// The `skills` documents still carry a legacy numeric `level` from the previous
// portfolio. The design deliberately does not express proficiency, so it is
// stripped here rather than left to leak out of /api/v1/skills.
//
// SOLID note (Open/Closed): exactly the extension point the base class exists
// for — no change to Repository itself.
class SkillRepo extends Repository<Skill> {
	protected override shape(doc: WithId<Document>): Skill {
		const { level: _legacyLevel, ...rest } = super.shape(doc) as Skill & { level?: number };
		return rest;
	}
}
class ProjectRepo extends Repository<Project> {}
class SocialRepo extends Repository<Social> {}
class CredentialRepo extends Repository<Credential> {}
class ExtraRepo extends Repository<Extra> {}
class StatRepo extends Repository<Stat> {}
class SectionRepo extends Repository<Section> {}
class IssuerRepo extends Repository<Issuer> {}
/**
 * Songs, with one query the other collections do not need: the library as ONE
 * account sees it.
 *
 * Each admin's grabs are their own shelf, so almost every read of this
 * collection is scoped to an owner. Doing it in Mongo rather than filtering the
 * full list in the caller keeps the rule from being half-applied — a route that
 * forgets to filter returns nothing rather than everyone's tracks.
 *
 * `owner: null` means every owner, which is what a super-admin gets; see
 * songScope() in permissions.ts for who is handed which.
 */
class SongRepo extends Repository<Song> {
	async listFor(owner: string | null, opts: { activeOnly?: boolean } = {}): Promise<Song[]> {
		const col = await this.col();
		const filter: Filter<Document> = {
			...(opts.activeOnly ? { isActive: { $ne: false } } : {}),
			...(owner === null ? {} : { owner })
		};
		const docs = await col.find(filter, { sort: { order: 1, _id: 1 } }).toArray();
		return docs.map((d) => this.shape(d));
	}
}

/**
 * The profile singleton.
 *
 * `profile` holds exactly one document. Rather than trusting callers to keep
 * it that way, `get()` creates the row on first read and `save()` always
 * targets that same _id — so there is no path that produces a second profile.
 */
class ProfileRepo extends Repository<Profile> {
	private readonly defaults: Partial<Profile> = {
		displayName: 'Pablo Cabrera',
		headline: 'Full Stack Engineer',
		bio: '',
		avatar: '/yo.webp',
		statusLabel: 'AVAILABLE',
		version: 'v4.0.0',
		metadata: []
	};

	async get(): Promise<Profile> {
		const existing = await this.list({ activeOnly: false });
		if (existing.length) return existing[0];
		return this.create(this.defaults);
	}

	async save(patch: Partial<Profile>): Promise<Profile> {
		const current = await this.get();
		const updated = await this.update(current.id!, patch);
		return updated ?? current;
	}

	/** Drop rows with an empty key and trim the rest. */
	static cleanMetadata(entries: MetaEntry[] | undefined): MetaEntry[] {
		return (entries ?? [])
			.map((e) => ({
				key: String(e.key ?? '').trim(),
				value: String(e.value ?? '').trim(),
				...(e.accent ? { accent: String(e.accent).trim() } : {})
			}))
			.filter((e) => e.key.length > 0);
	}
}

/** Words per minute used for the reading-time estimate. */
const WPM = 220;

export function slugify(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // strip accents: "Ingeniería" -> "Ingenieria"
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function readingMinutes(markdown: string): number {
	const words = markdown.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / WPM));
}

/**
 * Blog posts.
 *
 * SOLID note (Open/Closed): the first collection that genuinely needs more
 * than the generic CRUD — slug lookup, derived slug/reading-time, and a
 * publish transition — so it extends the base rather than changing it.
 */
class PostRepo extends Repository<Post> {
	/** Published posts only, newest first. The blog index uses this. */
	async published(): Promise<Post[]> {
		const all = await this.list({ activeOnly: true });
		return all
			.filter((p) => p.status === 'published' && p.publishedAt)
			.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
	}

	async bySlug(slug: string): Promise<Post | null> {
		const col = await this.col();
		const doc = await col.findOne({ slug });
		return doc ? this.shape(doc) : null;
	}

	/** Fill in slug, reading time and the publish timestamp. */
	private derive(body: Partial<Post>, existing?: Post): Partial<Post> {
		const next: Partial<Post> = { ...body };

		if (!next.slug && (next.title || existing?.title)) {
			next.slug = slugify(next.title ?? existing!.title);
		}
		if (next.slug) next.slug = slugify(next.slug);

		const markdown = next.body ?? existing?.body;
		if (typeof markdown === 'string') next.readingMinutes = readingMinutes(markdown);

		// Stamp publishedAt the first time a post goes live, and clear it if it
		// is pulled back to draft so the index cannot show a stale date.
		const status = next.status ?? existing?.status;
		if (status === 'published' && !existing?.publishedAt && !next.publishedAt) {
			next.publishedAt = new Date().toISOString();
		}
		if (status === 'draft') next.publishedAt = undefined;

		return next;
	}

	override async create(body: Partial<Post>): Promise<Post> {
		return super.create(this.derive(body));
	}

	override async update(id: string, body: Partial<Post>): Promise<Post | null> {
		const existing = await this.findById(id);
		if (!existing) return null;
		return super.update(id, this.derive(body, existing));
	}
}

// Singletons — one repo per collection per process.
export const companies = new CompanyRepo('companies');
export const skills = new SkillRepo('skills');
export const projects = new ProjectRepo('projects');
export const social = new SocialRepo('social');
export const credentials = new CredentialRepo('credentials');
export const extras = new ExtraRepo('extras');
export const stats = new StatRepo('stats');
export const posts = new PostRepo('posts');
export const sections = new SectionRepo('sections');
export const issuers = new IssuerRepo('issuers');
export const songs = new SongRepo('songs');
export const profile = new ProfileRepo('profile');

export { ProfileRepo };

// The generic-erased CRUD surface the dynamic route needs.
//
// SOLID note (Interface Segregation / Dependency Inversion): /api/v1/[entity]
// dispatches on a URL segment, so it cannot know the concrete entity type. It
// depends on this narrow abstraction stated in wire terms, which every
// concrete repo satisfies.
export interface AnyRepository {
	list(opts?: { activeOnly?: boolean }): Promise<BaseDoc[]>;
	paginate(opts?: {
		page?: number;
		perPage?: number;
		sort?: string;
		dir?: 'asc' | 'desc';
		activeOnly?: boolean;
		search?: string;
		searchFields?: string[];
	}): Promise<Paged<BaseDoc>>;
	findById(id: string): Promise<BaseDoc | null>;
	create(body: Record<string, unknown>): Promise<BaseDoc>;
	update(id: string, body: Record<string, unknown>): Promise<BaseDoc | null>;
	remove(id: string): Promise<boolean>;
}

// Registry — string entity slug → repo.
export const ENTITIES: Record<EntityName, AnyRepository> = {
	companies,
	skills,
	projects,
	social,
	credentials,
	extras,
	stats,
	posts,
	sections,
	issuers,
	songs
};

export function isEntityName(name: string): name is EntityName {
	return name in ENTITIES;
}

export function getRepo(name: EntityName): AnyRepository {
	return ENTITIES[name];
}
