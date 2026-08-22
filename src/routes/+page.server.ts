// Server load: pull portfolio content straight from Mongo, then shape it into
// what the Neon Protocol layout needs.
//
// This runs server-side only, so it talks to the repositories directly rather
// than round-tripping through /api/v1 — same data, one less hop.

import type { PageServerLoad } from './$types';
import { companies, credentials, projects, skills, social, stats } from '$lib/server/repositories';
import type { Credential, Skill } from '$lib/types';

// The portfolio states which technologies are used and deliberately expresses
// no proficiency — no levels, no ratings, no bars. Grouping is the only
// structure the skills section carries, and the collection has no `group`
// field populated, so this map supplies it until Mongo does.
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
// Index 0 is the current role because `order` sorts most-recent-first.
const SENIORITY = ['CURRENT', 'SENIOR', 'JUNIOR'];

// First professional role (I20VEINTE, Nov 2021). Periods are free-text strings
// in Mongo, so parsing them is fragile; this constant is the single source for
// the derived experience metric.
const CAREER_START = new Date('2021-11-01');

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

	// Anything the map doesn't mention still gets shown, never silently dropped.
	const placed = new Set(grouped.flatMap((g) => g.items.map((s) => s.id)));
	const rest = all.filter((s) => !placed.has(s.id));
	if (rest.length) grouped.push({ name: 'OTHER', accent: '#849495', items: rest });

	return grouped;
}

function groupCredentials(all: Credential[]) {
	const degrees = all.filter((c) => c.type === 'DEGREE');
	const certs = all.filter((c) => c.type !== 'DEGREE');

	const byIssuer = new Map<string, Credential[]>();
	for (const c of certs) {
		const key = c.institution;
		if (!byIssuer.has(key)) byIssuer.set(key, []);
		byIssuer.get(key)!.push(c);
	}

	const groups = [...byIssuer.entries()]
		.map(([issuer, items]) => ({
			issuer,
			items,
			logo: items.find((i) => i.image)?.image
		}))
		.sort((a, b) => b.items.length - a.items.length);

	return { degrees, groups };
}

export const load: PageServerLoad = async () => {
	const [statList, skillList, projectList, companyList, socialList, credentialList] =
		await Promise.all([
			stats.list({ activeOnly: true }),
			skills.list({ activeOnly: true }),
			projects.list({ activeOnly: true }),
			companies.list({ activeOnly: true }),
			social.list({ activeOnly: true }),
			credentials.list({ activeOnly: true })
		]);

	const { degrees, groups: credentialGroups } = groupCredentials(credentialList as Credential[]);

	return {
		stats: statList,
		experienceYears: yearsSince(CAREER_START),
		skillGroups: groupSkills(skillList as Skill[]),
		projects: projectList,
		companies: companyList.map((c, i) => ({
			...c,
			seniority: SENIORITY[i] ?? 'ENGINEER'
		})),
		social: socialList,
		degrees,
		credentialGroups,
		credentialCount: credentialList.length
	};
};
