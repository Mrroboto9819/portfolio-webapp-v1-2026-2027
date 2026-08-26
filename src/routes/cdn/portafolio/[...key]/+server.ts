// The media gate.
//
// Every media URL in Mongo is host-relative in the shape /cdn/portafolio/<key>,
// and this route IS that path: the storage bucket is private, so the only way
// bytes leave it is through here, fetched with credentials the app alone holds
// (the EC2 instance role — no keys anywhere).
//
// On k3s this route is effectively dead code: the ingress intercepts the same
// /cdn prefix and proxies MinIO before a request ever reaches the app, which
// is exactly what keeps beta on its own island.
//
// Caching still works because the response mirrors the object's own headers —
// uploadObject() stamps every key immutable-for-a-year, and the random suffix
// in the key is what makes that safe.
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getObject, storageConfigured } from '$lib/server/s3';

export const GET: RequestHandler = async ({ params, request }) => {
	if (!storageConfigured()) error(404, 'Not found');

	const key = params.key;
	// Keys are folder/date-rand.ext by construction; anything with traversal
	// or a leading dot was never minted by uploadObject().
	if (!key || key.includes('..') || key.startsWith('.')) error(404, 'Not found');

	// Forwarded verbatim so <audio> seeking gets real 206 partial responses.
	const range = request.headers.get('range') ?? undefined;

	try {
		const obj = await getObject(key, range);

		const headers = new Headers();
		if (obj.ContentType) headers.set('content-type', obj.ContentType);
		if (obj.ContentLength !== undefined) headers.set('content-length', String(obj.ContentLength));
		if (obj.ETag) headers.set('etag', obj.ETag);
		if (obj.ContentRange) headers.set('content-range', obj.ContentRange);
		headers.set('accept-ranges', 'bytes');
		headers.set('cache-control', obj.CacheControl ?? 'public, max-age=31536000, immutable');

		return new Response(obj.Body?.transformToWebStream(), {
			status: obj.$metadata.httpStatusCode === 206 ? 206 : 200,
			headers
		});
	} catch (e) {
		const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
		// A missing key is a visitor following a stale link, not a server fault.
		if (status === 404 || status === 403) error(404, 'Not found');
		if (status === 416) error(416, 'Range not satisfiable');
		throw e;
	}
};
