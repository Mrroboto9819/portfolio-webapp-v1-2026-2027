// Localisation.
//
// A translatable field is either a plain string (every row written before
// this existed) or { en, es }. `t()` accepts BOTH, which is the whole design:
// no migration, no big-bang cutover, and content becomes bilingual as it is
// edited. A row nobody has translated yet still renders — in English — rather
// than rendering blank.

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABEL: Record<Locale, string> = { en: 'EN', es: 'ES' };
export const LOCALE_NAME: Record<Locale, string> = { en: 'English', es: 'Español' };

/** A field that may or may not have been translated yet. */
export type Localized = { en?: string; es?: string };
export type I18nText = string | Localized | null | undefined;

export function isLocale(v: unknown): v is Locale {
	return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * Resolve a translatable value for a locale.
 *
 * Falls back through: requested locale → English → whichever translation
 * exists → empty. Never returns undefined, so a template can print it
 * directly without guarding.
 */
export function t(value: I18nText, locale: Locale = DEFAULT_LOCALE): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	return value[locale] || value.en || value.es || '';
}

/** Localise every translatable field on a record, returning plain strings. */
export function localizeRecord<T extends object>(
	row: T,
	fields: readonly string[],
	locale: Locale
): T {
	// The returned shape is identical to the input; only the value of each
	// translatable field narrows from `string | Localized` to `string`. Keeping
	// the generic as T means callers never have to cast, which is what stopped
	// the concrete entity types surviving the call.
	const out = { ...row } as Record<string, unknown>;
	for (const f of fields) {
		if (f in out) out[f] = t(out[f] as I18nText, locale);
	}
	return out as T;
}

/**
 * Which fields on each entity are translatable.
 *
 * Kept in one place so the admin, the API and the page cannot disagree about
 * what is a translated field and what is a plain one.
 */
export const TRANSLATABLE: Record<string, readonly string[]> = {
	profile: ['headline', 'bio', 'statusLabel'],
	sections: ['label', 'sub'],
	companies: [
		'role',
		'description',
		'employmentType',
		'workMode',
		'location',
		'duration',
		'seniority'
	],
	projects: ['description', 'type'],
	// note: certificate titles are official names and are NOT translated
	credentials: ['title', 'field'],
	extras: ['title', 'description'],
	stats: ['label'],
	posts: ['title', 'excerpt', 'body']
};

/**
 * Pick the locale for a request.
 *
 * `?lang=` wins so a link can pin a language — the same reason the filters
 * live in the query string: a URL sent to someone else behaves the same for
 * them. Then the cookie (their last explicit choice), then the browser's
 * Accept-Language, then English.
 */
export function resolveLocale(opts: {
	param?: string | null;
	cookie?: string | null;
	acceptLanguage?: string | null;
}): Locale {
	if (isLocale(opts.param)) return opts.param;
	if (isLocale(opts.cookie)) return opts.cookie;

	const header = opts.acceptLanguage ?? '';
	for (const part of header.split(',')) {
		const tag = part.trim().split(';')[0].slice(0, 2).toLowerCase();
		if (isLocale(tag)) return tag;
	}
	return DEFAULT_LOCALE;
}

/**
 * Static interface strings — the ones that are not content in the database.
 *
 * Kept small on purpose: anything an editor should be able to change belongs
 * in Mongo, not here. This is only chrome that ships with the code.
 */
export const UI: Record<Locale, Record<string, string>> = {
	en: {
		'nav.about': 'About',
		'nav.work': 'Work',
		'nav.skills': 'Skills',
		'nav.projects': 'Projects',
		'nav.credentials': 'Credentials',
		'nav.blog': 'Blog',
		'cta.projects': 'View projects',
		'cta.contact': 'Get in touch',
		'filter.discipline': 'Discipline',
		'filter.issuer': 'Issuer',
		'filter.all': 'All',
		'filter.showing': 'Showing',
		'filter.of': 'of',
		'filter.clear': 'clear filters',
		'footer.madeBy': 'Made by Pablo with',
		'footer.love': 'love',
		'footer.and': 'and',
		'footer.icons': 'Icons by',
		'blog.back': 'All posts',
		'blog.empty': 'No posts published yet.',
		'blog.read': 'min read',
		'project.open': 'Open',
		'project.code': 'Source',
		'project.download': 'Download',
		'project.private': 'Private repo'
	},
	es: {
		'nav.about': 'Perfil',
		'nav.work': 'Experiencia',
		'nav.skills': 'Habilidades',
		'nav.projects': 'Proyectos',
		'nav.credentials': 'Certificaciones',
		'nav.blog': 'Blog',
		'cta.projects': 'Ver proyectos',
		'cta.contact': 'Contáctame',
		'filter.discipline': 'Disciplina',
		'filter.issuer': 'Emisor',
		'filter.all': 'Todos',
		'filter.showing': 'Mostrando',
		'filter.of': 'de',
		'filter.clear': 'quitar filtros',
		'footer.madeBy': 'Hecho por Pablo con',
		'footer.love': 'cariño',
		'footer.and': 'y',
		'footer.icons': 'Iconos de',
		'blog.back': 'Todas las entradas',
		'blog.empty': 'Aún no hay entradas publicadas.',
		'blog.read': 'min de lectura',
		'project.open': 'Abrir',
		'project.code': 'Código',
		'project.download': 'Descargar',
		'project.private': 'Repo privado'
	}
};

/** Look up a static UI string, falling back to English then to the key. */
export function ui(key: string, locale: Locale = DEFAULT_LOCALE): string {
	return UI[locale]?.[key] ?? UI.en[key] ?? key;
}

/**
 * Server-side API messages.
 *
 * Kept beside the UI strings so both languages of a message live together.
 * The API resolves these against the request locale, which hooks already
 * derived from ?lang= / cookie / Accept-Language — so an error surfaces in the
 * reader's language rather than always in English.
 */
export const API_MESSAGES: Record<Locale, Record<string, string>> = {
	en: {
		'api.unauthorized': 'Your session has expired. Please sign in again.',
		'api.forbidden': 'Read-only: sign in to the admin to make changes.',
		'api.notFound': 'Not found.',
		'api.badJson': 'Invalid JSON body.',
		'api.badBody': 'Body must be an object.',
		'api.unknownEntity': 'Unknown entity.',
		'api.uploadNoFile': 'No file provided.',
		'api.uploadUnsupported': 'Unsupported file type.',
		'api.uploadTooLarge': 'File is too large.',
		'api.storageOff': 'Object storage is not configured.',
		'api.saved': 'Saved.',
		'api.deleted': 'Deleted.',
		'api.serverError': 'Something went wrong. Please try again.',
		'api.network': 'Network error — check your connection.'
	},
	es: {
		'api.unauthorized': 'Tu sesión ha expirado. Inicia sesión de nuevo.',
		'api.forbidden': 'Solo lectura: inicia sesión en el admin para hacer cambios.',
		'api.notFound': 'No encontrado.',
		'api.badJson': 'Cuerpo JSON inválido.',
		'api.badBody': 'El cuerpo debe ser un objeto.',
		'api.unknownEntity': 'Entidad desconocida.',
		'api.uploadNoFile': 'No se envió ningún archivo.',
		'api.uploadUnsupported': 'Tipo de archivo no admitido.',
		'api.uploadTooLarge': 'El archivo es demasiado grande.',
		'api.storageOff': 'El almacenamiento de objetos no está configurado.',
		'api.saved': 'Guardado.',
		'api.deleted': 'Eliminado.',
		'api.serverError': 'Algo salió mal. Inténtalo de nuevo.',
		'api.network': 'Error de red — revisa tu conexión.'
	}
};

/** Resolve an API message for a locale, falling back to English then the key. */
export function apiMessage(key: string, locale: Locale = DEFAULT_LOCALE): string {
	return API_MESSAGES[locale]?.[key] ?? API_MESSAGES.en[key] ?? key;
}
