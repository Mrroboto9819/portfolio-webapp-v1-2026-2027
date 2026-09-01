// Move or rename one stored file, keeping every database reference true.
//
// S3 has no rename, so the order of operations IS the safety story:
//
//   1. copy to the new key            (both URLs now serve bytes)
//   2. rewrite references in Mongo    (every stored URL still resolves)
//   3. delete the old key             (nothing points at it any more)
//
// A crash between any two steps leaves at worst an orphan copy — never a
// page with a broken image.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { copyObject, deleteObject, listObjects, publicUrlFor, storageConfigured } from '$lib/server/s3';
import { rewriteMediaReferences } from '$lib/server/mediaRefs';

// Folder/name.ext with the same characters buildKey() produces, plus enough
// freedom for a hand-chosen name. No dot-dot, no leading slash, one dot.
const DEST_SHAPE = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$/i;

export const POST: RequestHandler = async ({ request }) => {
	if (!storageConfigured()) error(503, 'Object storage is not configured');

	const body = await request.json().catch(() => null);
	const key = typeof body?.key === 'string' ? body.key : '';
	const dest = typeof body?.dest === 'string' ? body.dest.replace(/^\/+/, '') : '';

	if (!key || key.includes('..')) error(400, 'A valid "key" is required');
	if (!dest || dest.includes('..') || !DEST_SHAPE.test(dest)) {
		error(400, 'A valid "dest" is required — folder/name.ext, letters, digits, dashes');
	}
	if (dest === key) error(400, 'Source and destination are the same key');

	// The extension is the content type's disguise on /cdn — changing it while
	// moving would serve the same bytes under a lying name.
	const extOf = (k: string) => k.slice(k.lastIndexOf('.') + 1).toLowerCase();
	if (extOf(dest) !== extOf(key)) error(400, 'The extension must stay the same');

	// Refuse to overwrite: a collision means someone is about to clobber a
	// file whose URL other content may rely on.
	const existing = await listObjects(dest);
	if (existing.some((o) => o.key === dest)) error(409, `"${dest}" already exists`);

	await copyObject(key, dest);
	const refsUpdated = await rewriteMediaReferences(publicUrlFor(key), publicUrlFor(dest));
	await deleteObject(key);

	return json({ moved: key, to: dest, url: publicUrlFor(dest), refsUpdated });
};
