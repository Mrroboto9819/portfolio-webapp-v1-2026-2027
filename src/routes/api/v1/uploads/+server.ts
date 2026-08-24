// Upload endpoint.
//
// Writes go through hooks.server.ts, which already requires an admin session
// or the API token for any mutating /api/* request — so this route inherits
// authorisation rather than re-implementing it.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadObject, storageConfigured, MAX_UPLOAD_BYTES, ALLOWED_TYPES } from '$lib/server/s3';

export const GET: RequestHandler = async () =>
	json({
		configured: storageConfigured(),
		maxBytes: MAX_UPLOAD_BYTES,
		accepts: Object.keys(ALLOWED_TYPES)
	});

export const POST: RequestHandler = async ({ request }) => {
	if (!storageConfigured()) error(503, 'Object storage is not configured');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected multipart/form-data');
	}

	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'No file provided under the "file" field');

	const folder = String(form.get('folder') ?? 'uploads');

	try {
		return json(await uploadObject(file, folder), { status: 201 });
	} catch (e) {
		// Type and size failures are the caller's fault, not the server's.
		const message = e instanceof Error ? e.message : 'Upload failed';
		error(/Unsupported|limit is|empty/.test(message) ? 400 : 500, message);
	}
};
