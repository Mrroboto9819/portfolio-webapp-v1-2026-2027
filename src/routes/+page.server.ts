// Server load: pull the portfolio from Mongo and shape it for the layout.
//
// Everything the landing page renders is data. Copy, section headings,
// section ORDER and section visibility all come from the database, so the
// admin changes the page without a deploy. The only thing hardcoded here is
// the mapping from a section `key` to the component that renders it — that is
// code, not content.

import type { PageServerLoad } from './$types';
import {
	companies,
	credentials,
	profile,
	projects,
	sections,
	skills,
	social,
	stats
} from '$lib/server/repositories';
import { TRACKS, type Credential, type Section, type Skill, type Track } from '$lib/types';

// The skills collection carries no `group`, so grouping is presentational
// until it does. Accent per group is design, not data.
const SKILL_GROUPS: { name: string; accent: string; members: string[] }[] = [
	{
		name: 'FRONTEND',
		accent: '#00f3ff',
		members: ['JAVASCRIPT', 'VUE.JS', 'REACT', 'NEXT', 'NUXT']
	},
	{ name: 'BACKEND', accent: '#fe00fe', members: ['NODE.JS', 'PYTHON', 'DJANGO', 'FLASK'] },
	{ name: 'DATA & INFRA', accent: '#a1f21d', members: ['MONGODB', 'MYSQL', 'DOCKER'] }
];

// Seniority chips are presentational — the collection stores no seniority.
const SENIORITY = ['CURRENT', 'SENIOR', 'JUNIOR'];

// First professional role. Periods are free text in Mongo, so parsing them is
// fragile; this is the single source for the derived experience metric.
const CAREER_START = new Date('2021-11-01');

// Fallback headings, used only when `sections` is empty (fresh database).
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

function yearsSince(from: Date): number {
	return Math.floor((Date.now() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

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

function groupCredentials(certs: Credential[]) {
	const byIssuer = new Map<string, Credential[]>();
	for (const c of certs) {
		if (!byIssuer.has(c.institution)) byIssuer.set(c.institution, []);
		byIssuer.get(c.institution)!.push(c);
	}
	const groups = [...byIssuer.entries()]
		.map(([issuer, items]) => ({ issuer, items, logo: items.find((i) => i.image)?.image }))
		.sort((a, b) => b.items.length - a.items.length);
	return { groups };
}

export const load: PageServerLoad = async ({ url }) => {
	const [me, sectionRows, statList, skillList, projectList, companyList, socialList, credList] =
		await Promise.all([
			profile.get(),
			sections.list({ activeOnly: true }),
			stats.list({ activeOnly: true }),
			skills.list({ activeOnly: true }),
			projects.list({ activeOnly: true }),
			companies.list({ activeOnly: true }),
			social.list({ activeOnly: true }),
			credentials.list({ activeOnly: true })
		]);

	// ---- filters -------------------------------------------------------
	// Read from the query string so a filtered view is a shareable URL: the
	// exact link can go on a CV and the recruiter sees that slice.
	const allCreds = credList as Credential[];
	const certs = allCreds.filter((c) => c.type !== 'DEGREE');

	const trackParam = url.searchParams.get('track');
	const track: Track | null = TRACKS.includes(trackParam as Track) ? (trackParam as Track) : null;

	const issuerParam = url.searchParams.get('issuer');
	const issuers = [...new Set(certs.map((c) => c.institution))].sort();
	const issuer = issuerParam && issuers.includes(issuerParam) ? issuerParam : null;

	const matchesTrack = (c: Credential) => !track || c.track === track;
	const matchesIssuer = (c: Credential) => !issuer || c.institution === issuer;

	// Faceted counts: each facet counts against the OTHER filter, so the number
	// on a chip is what you would actually get by clicking it — not a total
	// that shrinks to zero the moment you click.
	const trackOptions = TRACKS.map((t) => ({
		value: t,
		label: t,
		count: certs.filter((c) => c.track === t && matchesIssuer(c)).length
	})).filter((o) => o.count > 0);

	const issuerOptions = issuers
		.map((i) => ({
			value: i,
			label: i,
			count: certs.filter((c) => c.institution === i && matchesTrack(c)).length
		}))
		.filter((o) => o.count > 0);

	const filteredCerts = certs.filter((c) => matchesTrack(c) && matchesIssuer(c));
	const degrees = allCreds.filter((c) => c.type === 'DEGREE');

	// A degree is not discipline-specific, so it stays visible unless an issuer
	// filter explicitly excludes it.
	const visibleDegrees = issuer ? degrees.filter((d) => d.institution === issuer) : degrees;

	const credentialGroups = groupCredentials(filteredCerts).groups;

	return {
		profile: me,
		// Repository.list already sorts by `order`, so reordering in the admin
		// reorders the page. An empty collection falls back to the built-in set
		// rather than rendering a bare page.
		sections: sectionRows.length ? (sectionRows as Section[]) : DEFAULT_SECTIONS,
		stats: statList,
		experienceYears: yearsSince(CAREER_START),
		skillGroups: groupSkills(skillList as Skill[]),
		projects: projectList,
		companies: companyList.map((c, i) => ({ ...c, seniority: SENIORITY[i] ?? 'ENGINEER' })),
		social: socialList,
		degrees: visibleDegrees,
		credentialGroups,
		credentialCount: filteredCerts.length + visibleDegrees.length,
		filters: {
			track,
			issuer,
			trackOptions,
			issuerOptions,
			active: Boolean(track || issuer),
			totalCredentials: allCreds.length
		}
	};
};
