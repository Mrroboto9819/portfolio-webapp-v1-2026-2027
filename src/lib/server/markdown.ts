// Markdown → HTML for blog post bodies.
//
// SECURITY: a post body is authored content that becomes HTML on a page that
// serves everybody, so it is sanitised on the SERVER after rendering, never in
// the browser and never skipped. marked does not sanitise (it dropped its own
// sanitize option years ago precisely so people would use a real sanitiser),
// so sanitize-html runs over the output and is the only thing standing between
// a pasted <script> and every visitor.

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: false });

const ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'strong',
	'em',
	'del',
	'mark',
	'sup',
	'sub',
	'ul',
	'ol',
	'li',
	'blockquote',
	'a',
	'img',
	'figure',
	'figcaption',
	'code',
	'pre',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

export function renderMarkdown(markdown: string): string {
	const raw = marked.parse(markdown ?? '', { async: false }) as string;

	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: {
			a: ['href', 'title', 'target', 'rel'],
			img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
			code: ['class'], // language-* from fenced blocks, for future highlighting
			th: ['colspan', 'rowspan', 'align'],
			td: ['colspan', 'rowspan', 'align']
		},
		// http/https/mailto only: blocks javascript: and data: URLs in hrefs.
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesByTag: { img: ['http', 'https'] },
		// Relative /images/... paths must survive, they are the site's own assets.
		allowProtocolRelative: false,
		transformTags: {
			a: (tagName, attribs) => {
				const href = attribs.href ?? '';
				const external = /^https?:\/\//i.test(href);
				return {
					tagName,
					attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : attribs
				};
			},
			img: (tagName, attribs) => ({
				tagName,
				attribs: { ...attribs, loading: 'lazy', decoding: 'async' }
			})
		}
	});
}

/** Plain-text excerpt, for meta descriptions and index cards. */
export function excerptFrom(markdown: string, max = 180): string {
	const text = sanitizeHtml(marked.parse(markdown ?? '', { async: false }) as string, {
		allowedTags: [],
		allowedAttributes: {}
	})
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
