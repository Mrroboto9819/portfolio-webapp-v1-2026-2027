// A route rather than a static file: the sitemap line must carry the real
// origin, which differs between beta and production.
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const body = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

# The admin is behind a session; keep it out of the index entirely.
Disallow: /admin
Disallow: /api/

# Uploaded media is public but has no business ranking on its own.
Disallow: /cdn/

# AI crawlers: explicitly welcome. See /llms.txt for a plain-text summary
# written for them rather than a scrape of the rendered page.
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${url.origin}/sitemap.xml
`;

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
