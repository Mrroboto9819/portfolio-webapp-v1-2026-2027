// Server load: pull the portfolio from Mongo and shape it for the layout.
//
// Everything the landing page renders is data — copy, headings, section order
// and visibility all come from the database, so the admin changes the page
// without a deploy. The only thing hardcoded is which component a section
// `key` maps to, which is code rather than content.

import type { PageServerLoad } from './$types';
import {
	companies,
	credentials,
	issuers as issuerRepo,
	profile,
	projects,
	sections,
	skills,
	social,
	stats
} from '$lib/server/repositories';
import {
	TRACKS,
	type Credential,
	type Issuer,
	type Section,
	type Skill,
	type Track
} from '$lib/types';
import { TRANSLATABLE, localizeRecord, type Locale } from '$lib/i18n';

// Skills carry no `group`, so grouping is presentational until they do.
const SKILL_GROUPS: { name: string; accent: string; members: string[] }[] = [
	{
		name: 'FRONTEND',
		accent: '#00f3ff',
		members: ['JAVASCRIPT', 'VUE.JS', 'REACT', 'NEXT', 'NUXT']
	},
	{ name: 'BACKEND', accent: '#fe00fe', members: ['NODE.JS', 'PYTHON', 'DJANGO', 'FLASK'] },
	{ name: 'DATA & INFRA', accent: '#a1f21d', members: ['MONGODB', 'MYSQL', 'DOCKER'] }
];

const CAREER_START = new Date('2021-11-01');

const DEFAULT_SECTIONS: Pick<Section, 'key' | 'label' | 'sub'>[] = [
	{ key: 'metrics', label: 'Metrics', sub: '' },
	{ key: 'work', label: 'Professional Experience', sub: 'Detailed work history' },
	{
		key: 'skills',
		label: 'Technical Skills',
		sub: '[SYS_MSG] Stack index loaded. Access granted.'
	},
	{ key: 'projects', label: 'Selected Projects', sub: 'Deployed systems' },
	{ key: 'credentials', label: 'Credentials', sub: '' },
	{ key: 'extras', label: 'Personal Interests', sub: '' }
];

const yearsSince = (from: Date) =>
	Math.floor((Date.now() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

function groupSkills(all: Skill[]) {
	const byName = new Map(all.map((s) => [s.name.toUpperCase(), s]));
	const grouped = SKILL_GROUPS.map((g) => ({
		name: g.name,
		accent: g.accent,
		items: g.members.map((m) => byName.get(m)).filter((s): s is Skill => Boolean(s))
	})).filter((g) => g.items.length > 0);

	// Anything the map doesn't mention is still shown, never silently dropped.
	const placed = new Set(grouped.flatMap((g) => g.items.map((s) => s.id)));
	const rest = all.filter((s) => !placed.has(s.id));
	if (rest.length) grouped.push({ name: 'OTHER', accent: '#849495', items: rest });
	return grouped;
}

type JoinedCred = Credential & {
	issuerSlug?: string;
	issuerName: string;
	issuerUrl?: string | null;
};

type CredNode = JoinedCred & { children: JoinedCred[] };

/**
 * Group certificates by issuer, nesting course-of-a-specialisation under its
 * parent.
 *
 * A child whose parent is not in the filtered set is promoted to a root rather
 * than dropped — otherwise filtering by, say, "devops" would silently hide
 * Version Control just because its parent specialisation is a mobile one.
 */
function groupByIssuer(certs: JoinedCred[]) {
	const present = new Set(certs.map((c) => c.id));

	const roots = certs.filter((c) => !c.parentId || !present.has(c.parentId));
	const childrenOf = new Map<string, JoinedCred[]>();
	for (const c of certs) {
		if (c.parentId && present.has(c.parentId)) {
			if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, []);
			childrenOf.get(c.parentId)!.push(c);
		}
	}

	const nodes: CredNode[] = roots.map((r) => ({ ...r, children: childrenOf.get(r.id!) ?? [] }));

	const map = new Map<string, CredNode[]>();
	for (const n of nodes) {
		const key = n.issuerName;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(n);
	}

	return [...map.entries()]
		.map(([issuer, items]) => ({
			issuer,
			items,
			// Count courses too, so the header reflects what is really shown.
			total: items.reduce((n, i) => n + 1 + i.children.length, 0),
			logo: items.find((i) => i.image)?.image,
			url: items.find((i) => i.issuerUrl)?.issuerUrl ?? undefined
		}))
		.sort((a, b) => b.total - a.total);
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const locale: Locale = locals.locale;

	// Resolve translations on the SERVER so components receive plain strings.
	// Shipping both languages to the browser and picking there would double the
	// payload and put the fallback logic in every template.
	const L = <T extends object>(row: T, entity: string): T =>
		localizeRecord(row, TRANSLATABLE[entity] ?? [], locale);
	const [
		me,
		sectionRows,
		statList,
		skillList,
		projectList,
		companyList,
		socialList,
		credList,
		issuerList
	] = await Promise.all([
		profile.get(),
		sections.list({ activeOnly: true }),
		stats.list({ activeOnly: true }),
		skills.list({ activeOnly: true }),
		projects.list({ activeOnly: true }),
		companies.list({ activeOnly: true }),
		social.list({ activeOnly: true }),
		credentials.list({ activeOnly: true }),
		issuerRepo.list({ activeOnly: true })
	]);

	const allCreds = credList as Credential[];
	const issuerRows = issuerList as Issuer[];
	const byId = new Map(issuerRows.map((i) => [i.id!, i]));
	const bySlug = new Map(issuerRows.map((i) => [i.slug, i]));

	// Resolve each certificate through the issuer relation, so the logo and
	// link live in one place: changing Meta's logo is one edit, not nine.
	const joined: JoinedCred[] = allCreds
		.filter((c) => c.type !== 'DEGREE')
		.map((c) => {
			const iss = c.issuerId ? byId.get(c.issuerId) : undefined;
			return {
				...c,
				issuerSlug: iss?.slug,
				issuerName: iss?.name ?? c.institution,
				image: iss?.logo ?? c.image,
				issuerUrl: iss?.url
			};
		});

	// ---- filters: query parameters, not component state ------------------
	// A filtered view is a shareable URL, so the exact link can go on a CV.
	// Namespaced `cert_*` so other sections can add filters without colliding.
	const trackParam = url.searchParams.get('cert_track');
	const track: Track | null = TRACKS.includes(trackParam as Track) ? (trackParam as Track) : null;

	// Accepts a slug (readable and stable — what the links use) or a raw id,
	// so an id-based link keeps working too.
	const issuerParam = url.searchParams.get('cert_issuer');
	const activeIssuer = issuerParam ? (bySlug.get(issuerParam) ?? byId.get(issuerParam)) : undefined;
	const issuerSlug = activeIssuer?.slug ?? null;

	const matchesTrack = (c: JoinedCred) => !track || c.track === track;
	const matchesIssuer = (c: JoinedCred) => !issuerSlug || c.issuerSlug === issuerSlug;

	// Faceted counts: each facet counts against the OTHER filter, so a chip's
	// number is what clicking it actually yields.
	const trackOptions = TRACKS.map((t) => ({
		value: t,
		label: t,
		count: joined.filter((c) => c.track === t && matchesIssuer(c)).length
	})).filter((o) => o.count > 0);

	const issuerOptions = issuerRows
		.map((i) => ({
			value: i.slug,
			label: i.name,
			count: joined.filter((c) => c.issuerSlug === i.slug && matchesTrack(c)).length
		}))
		.filter((o) => o.count > 0)
		.sort((a, b) => b.count - a.count);

	const filteredCerts = joined.filter((c) => matchesTrack(c) && matchesIssuer(c));
	// A degree is not discipline-specific, so a discipline filter leaves it
	// alone; only an issuer filter excludes it.
	const visibleDegrees = issuerSlug ? [] : allCreds.filter((c) => c.type === 'DEGREE');

	return {
		locale,
		profile: L(me, 'profile'),
		sections: (sectionRows.length ? (sectionRows as Section[]) : DEFAULT_SECTIONS).map((r) =>
			L(r, 'sections')
		),
		stats: statList.map((r) => L(r, 'stats')),
		experienceYears: yearsSince(CAREER_START),
		skillGroups: groupSkills(skillList as Skill[]),
		// Work projects resolve their company name through companyId, so the card
		// can say "at Alluxi" without duplicating the name on every project.
		projects: projectList.map((r) => {
			const localized = L(r, 'projects');
			const company = r.companyId ? companyList.find((c) => c.id === r.companyId) : undefined;
			return { ...localized, companyName: company?.name };
		}),
		// The badge is a stored field, not a guess from row order. Empty means no
		// badge — an ordering accident should never label someone "JUNIOR".
		companies: companyList.map((c) => L(c, 'companies')),
		social: socialList,
		degrees: visibleDegrees.map((r) => L(r, 'credentials')),
		credentialGroups: groupByIssuer(
			filteredCerts.map(
				(r) => L(r as unknown as Record<string, unknown>, 'credentials') as unknown as JoinedCred
			)
		),
		credentialCount: filteredCerts.length + visibleDegrees.length,
		filters: {
			track,
			issuer: issuerSlug,
			trackOptions,
			issuerOptions,
			active: Boolean(track || issuerSlug),
			totalCredentials: allCreds.length
		}
	};
};
