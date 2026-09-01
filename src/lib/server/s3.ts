// Object storage.
//
// Talks plain S3, so the only difference between the k3s MinIO pod and a real
// AWS bucket is the endpoint and credentials — no code changes when this moves.
//
// The database stores the returned URL and nothing else; bytes never touch
// Mongo or the app pod's filesystem, which keeps the pod disposable.

import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	CopyObjectCommand
} from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — images, PDFs
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB — a few minutes of mp3

// An explicit allowlist, not a blocklist. The bucket is served publicly, so
// anything accepted here is served to every visitor — SVG is deliberately
// excluded because it can carry script and would be served same-origin.
export const ALLOWED_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
	'application/pdf': 'pdf',
	// Audio for the player queue. mp3 only: it is what browsers play
	// universally, and a narrow list is the point of an allowlist.
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3'
};

export function storageConfigured(): boolean {
	// The bucket is the only universal requirement. Endpoint and static keys
	// are how the k3s MinIO is reached; on AWS neither exists — the SDK finds
	// real S3 on its own and the EC2 instance role supplies credentials.
	return Boolean(env.S3_BUCKET);
}

let client: S3Client | null = null;
function s3(): S3Client {
	if (client) return client;
	if (!storageConfigured()) throw new Error('Object storage is not configured');

	client = new S3Client({
		region: env.S3_REGION || 'us-east-1',
		// Only MinIO needs an endpoint. Left undefined, the SDK targets S3.
		...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
		// MinIO serves buckets as a path, not a subdomain, so path-style
		// defaults on whenever a custom endpoint is set. Real S3 wants
		// virtual-hosted addressing, so with no endpoint it defaults off.
		// S3_FORCE_PATH_STYLE still overrides either default explicitly.
		forcePathStyle: env.S3_ENDPOINT
			? env.S3_FORCE_PATH_STYLE !== 'false'
			: env.S3_FORCE_PATH_STYLE === 'true',
		// Static keys only when both are provided (MinIO). Omitted, the SDK
		// walks its default chain — env vars, then the instance role via the
		// metadata service — which is what keeps long-lived keys off the box.
		...(env.S3_ACCESS_KEY && env.S3_SECRET_KEY
			? {
					credentials: {
						accessKeyId: env.S3_ACCESS_KEY,
						secretAccessKey: env.S3_SECRET_KEY
					}
				}
			: {})
	});
	return client;
}

/** `folder/2026-08-24-a1b2c3d4.png` — sortable, collision-free, no user input in the path. */
function buildKey(folder: string, ext: string): string {
	const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'uploads';
	const date = new Date().toISOString().slice(0, 10);
	const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
	return `${safeFolder}/${date}-${rand}.${ext}`;
}

export type UploadResult = { url: string; key: string; size: number; type: string };

export async function uploadObject(file: File, folder = 'uploads'): Promise<UploadResult> {
	const ext = ALLOWED_TYPES[file.type];
	if (!ext) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
	// Audio gets a larger ceiling than an image would ever need.
	const limit = ext === 'mp3' ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
	if (file.size > limit) {
		throw new Error(
			`File is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${limit / 1048576} MB`
		);
	}
	if (file.size === 0) throw new Error('File is empty');

	const key = buildKey(folder, ext);
	const body = new Uint8Array(await file.arrayBuffer());

	await s3().send(
		new PutObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: key,
			Body: body,
			ContentType: file.type,
			// Immutable: the key carries a random suffix, so a given URL never
			// changes content and can be cached hard.
			CacheControl: 'public, max-age=31536000, immutable'
		})
	);

	return { url: publicUrlFor(key), key, size: file.size, type: file.type };
}

/**
 * The stored URL for a key. Host-relative, so the same value works on beta,
 * prod and behind a CDN without rewriting the database.
 */
export function publicUrlFor(key: string): string {
	const base = (env.S3_PUBLIC_BASE || `/cdn/${env.S3_BUCKET}`).replace(/\/$/, '');
	return `${base}/${key}`;
}

export type StoredObject = { key: string; url: string; size: number; lastModified: string };

/**
 * Every object in the bucket (or under one prefix), pagination folded away.
 *
 * On AWS this is the one call that needs `s3:ListBucket` on the instance role
 * — a bucket-level action the role deliberately lacked until the media
 * manager existed (see infra/terraform/iam.tf). MinIO's static keys have
 * always been able to list.
 */
export async function listObjects(prefix?: string): Promise<StoredObject[]> {
	const out: StoredObject[] = [];
	let token: string | undefined;
	do {
		const page = await s3().send(
			new ListObjectsV2Command({
				Bucket: env.S3_BUCKET,
				...(prefix ? { Prefix: prefix } : {}),
				...(token ? { ContinuationToken: token } : {})
			})
		);
		for (const o of page.Contents ?? []) {
			if (!o.Key) continue;
			out.push({
				key: o.Key,
				url: publicUrlFor(o.Key),
				size: o.Size ?? 0,
				lastModified: o.LastModified?.toISOString() ?? ''
			});
		}
		token = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (token);
	return out;
}

/**
 * Server-side copy — the first half of a move or rename, since S3 has no
 * rename. The caller deletes the source only after the copy AND the database
 * reference rewrite succeed, so a crash mid-move never leaves a broken link.
 */
export async function copyObject(fromKey: string, toKey: string): Promise<void> {
	await s3().send(
		new CopyObjectCommand({
			Bucket: env.S3_BUCKET,
			// The whole source (bucket/key) is one URL-encoded header value.
			CopySource: encodeURIComponent(`${env.S3_BUCKET}/${fromKey}`),
			Key: toKey,
			MetadataDirective: 'COPY'
		})
	);
}

export async function deleteObject(key: string): Promise<void> {
	await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/**
 * Fetch an object for the /cdn/portafolio/ media gate. The bucket is private;
 * this call — signed with the instance role — is the only road the bytes have
 * out of storage. Range passes through untouched so audio seeking keeps
 * working: S3 answers 206 with a Content-Range exactly like a web server.
 */
export async function getObject(key: string, range?: string) {
	return s3().send(
		new GetObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: key,
			...(range ? { Range: range } : {})
		})
	);
}
