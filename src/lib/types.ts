// Wire-format types — what crosses the API boundary in both directions.
// `id` is the string form of Mongo's _id. ObjectId never leaves the server
// layer; everything client-side speaks plain strings.

export type BaseDoc = {
	id?: string;
	order?: number;
	isActive?: boolean;
	createdAt?: string;
	updatedAt?: string;
};

export type Stat = BaseDoc & {
	label: string;
	value: string;
	icon?: string;
};

export type Company = BaseDoc & {
	name: string;
	role: string;
	period: string;
	logo?: string;
	tech: string[];
	highlights?: string[];
};

export type SkillGroup = 'frontend' | 'backend' | 'devops' | 'data' | 'creative';

// Deliberately no proficiency field. The portfolio states which technologies
// are used, never a self-assessed level — no `level`, no rating, no bar. The
// Mongo documents still carry a legacy `level`; SkillRepo strips it so it is
// not served either.
export type Skill = BaseDoc & {
	name: string;
	group?: SkillGroup;
	icon?: string;
};

export type ProjectStatus = 'live' | 'wip' | 'archived';

export type ProjectPlatform = {
	name: string;
	icon?: string;
	url: string;
};

export type Project = BaseDoc & {
	name: string;
	type?: string; // MAIN_QUEST / SIDE_QUEST etc
	description: string;
	tech: string[];
	completed?: boolean;
	redirect?: string;
	platforms?: ProjectPlatform[];
	status?: ProjectStatus;
};

export type Social = BaseDoc & {
	name: string;
	icon?: string;
	url: string;
	handle?: string;
};

export type Credential = BaseDoc & {
	type: 'DEGREE' | 'CERTIFICATE';
	title: string;
	institution: string;
	field?: string;
	period: string;
	credentialId?: string;
	image?: string;
	skills?: string[];
	/** Institution or verification page. Renders the institution as a link. */
	url?: string;
};

export type Extra = BaseDoc & {
	title: string;
	tag: string; // GAME_DEV / 3D / ART / MOTION / AUDIO ...
	description: string;
	icon?: string;
};

/**
 * One metadata row on the profile — a Stripe-style key/value pair.
 *
 * Stored as an ORDERED ARRAY rather than a plain object: the readout renders
 * these in sequence, and a JS object gives no dependable ordering for
 * non-numeric keys. It also makes the admin editor a simple list to reorder.
 */
export type MetaEntry = {
	key: string;
	value: string;
	/** Optional accent for the value, e.g. a token name or hex. */
	accent?: string;
};

/**
 * The "about me" singleton. Exactly one document lives in `profile`; the
 * repository enforces that rather than trusting callers.
 */
export type Profile = BaseDoc & {
	displayName: string;
	headline: string;
	bio: string;
	/** Path under static/, e.g. /yo.webp — switchable from the admin. */
	avatar?: string;
	statusLabel?: string;
	version?: string;
	metadata?: MetaEntry[];
};

/**
 * A homepage section. Order and visibility are data, so sections can be
 * reordered or hidden from the admin without a deploy. `key` maps to the
 * renderer; it is a fixed vocabulary, not free text.
 */
export type SectionKey =
	| 'metrics'
	| 'work'
	| 'skills'
	| 'projects'
	| 'credentials'
	| 'extras';

export type Section = BaseDoc & {
	key: SectionKey;
	label: string;
	sub?: string;
};

export type PostStatus = 'draft' | 'published';

export type Post = BaseDoc & {
	title: string;
	/** URL segment: /blog/<slug>. Unique, lowercase, hyphenated. */
	slug: string;
	/** Short summary for the index card and meta description. */
	excerpt?: string;
	/** Markdown SOURCE. Never HTML — it is rendered and sanitised server-side. */
	body: string;
	tags?: string[];
	coverImage?: string;
	/** ISO date. Absent until first published. */
	publishedAt?: string;
	/** Derived from body length on save; used for the "N min read" label. */
	readingMinutes?: number;
	status?: PostStatus;
};

// Catalog of every entity exposed by /api/v1/[entity].
// Mirroring this on both client + server keeps types in sync.
export type EntityTypeMap = {
	stats: Stat;
	companies: Company;
	skills: Skill;
	projects: Project;
	social: Social;
	credentials: Credential;
	extras: Extra;
	posts: Post;
	sections: Section;
};
export type EntityName = keyof EntityTypeMap;
