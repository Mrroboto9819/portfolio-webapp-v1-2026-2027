// Sitemap, generated from the database so a published post appears without a
// deploy. Both locales are listed with hreflang alternates, because the same
// URL serves either language depending on ?lang= — without the alternates a
// crawler would only ever see one.
import type { RequestHandler } from './$types';
import { posts } from '$lib/server/repositories';
import { LOCALES } from '$lib/i18n';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const origin = url.origin;
	const published = await posts.published();

	const entries: { loc: string; lastmod?: string; priority: string; changefreq: string }[] = [
		{ loc: `${origin}/`, priority: '1.0', changefreq: 'weekly' },
		{ loc: `${origin}/blog`, priority: '0.8', changefreq: 'weekly' },
		...published.map((p) => ({
			loc: `${origin}/blog/${p.slug}`,
			lastmod: p.updatedAt ?? p.publishedAt,
			priority: '0.7',
			changefreq: 'monthly'
		}))
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
	.map(
		(e) => `  <url>
    <loc>${esc(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${esc(e.lastmod.slice(0, 10))}</lastmod>` : ''}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
${LOCALES.map(
	(l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(e.loc)}?lang=${l}"/>`
).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(e.loc)}"/>
  </url>`
	)
	.join('\n')}
</urlset>
`;

	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
