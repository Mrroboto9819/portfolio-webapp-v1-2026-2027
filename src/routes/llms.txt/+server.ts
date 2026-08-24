// llms.txt — a plain-text brief written FOR language models.
//
// The emerging convention (llmstxt.org): rather than let a model infer the
// site from scraped HTML full of nav chrome and CSS classes, hand it a curated
// summary with the canonical links. Generated from the database so it never
// drifts from what the site actually says.

import type { RequestHandler } from './$types';
import { companies, posts, profile, skills } from '$lib/server/repositories';
import { t } from '$lib/i18n';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const origin = url.origin;
	const [me, jobs, skillList, published] = await Promise.all([
		profile.get(),
		companies.list({ activeOnly: true }),
		skills.list({ activeOnly: true }),
		posts.published()
	]);

	const byGroup = new Map<string, string[]>();
	for (const s of skillList) {
		const g = s.group?.trim() || 'Other';
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g)!.push(s.name);
	}

	const body = `# ${t(me.displayName, 'en') || 'Pablo Cabrera'}

> ${t(me.bio, 'en')}

Full-stack software engineer based in Mexico. This site is the portfolio and
technical blog. Content is available in English and Spanish; append \`?lang=es\`
to any URL for Spanish.

## Experience

${jobs
	.map(
		(j) =>
			`- **${j.name}** — ${t(j.role, 'en')} (${j.period}${j.workMode ? `, ${t(j.workMode, 'en')}` : ''})\n  ${t(j.description, 'en')}`
	)
	.join('\n')}

## Stack

${[...byGroup.entries()].map(([g, list]) => `- **${g}**: ${list.join(', ')}`).join('\n')}

## Writing

${
	published.length
		? published
				.map((p) => `- [${t(p.title, 'en')}](${origin}/blog/${p.slug}): ${t(p.excerpt, 'en')}`)
				.join('\n')
		: '- No posts published yet.'
}

## Links

- [Portfolio](${origin}/)
- [Blog](${origin}/blog)
- [Sitemap](${origin}/sitemap.xml)

## Notes for crawlers

- Every page is server-rendered; no JavaScript is required to read the content.
- \`?lang=en\` and \`?lang=es\` select the language and are declared as hreflang
  alternates in the sitemap.
- Certificate titles are intentionally left in their original language, as they
  are official award names.
`;

	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
