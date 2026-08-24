import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { profile, ProfileRepo } from '$lib/server/repositories';
import { listImageAssets } from '$lib/server/assets';
import type { MetaEntry } from '$lib/types';

export const load: PageServerLoad = async () => ({
	profile: await profile.get(),
	assets: await listImageAssets()
});

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();

		// Metadata arrives as three parallel arrays; zip them back into rows.
		// Order is preserved because getAll() returns fields in document order.
		const keys = form.getAll('meta_key').map(String);
		const values = form.getAll('meta_value').map(String);
		const accents = form.getAll('meta_accent').map(String);
		const metadata: MetaEntry[] = keys.map((key, i) => ({
			key,
			value: values[i] ?? '',
			accent: accents[i] || undefined
		}));

		const displayName = String(form.get('displayName') ?? '').trim();
		const headline = String(form.get('headline') ?? '').trim();
		if (!displayName) return fail(400, { message: 'Display name is required.' });
		if (!headline) return fail(400, { message: 'Headline is required.' });

		try {
			await profile.save({
				displayName,
				headline,
				bio: String(form.get('bio') ?? '').trim(),
				avatar: String(form.get('avatar') ?? '').trim() || undefined,
				statusLabel: String(form.get('statusLabel') ?? '').trim() || undefined,
				version: String(form.get('version') ?? '').trim() || undefined,
				metadata: ProfileRepo.cleanMetadata(metadata)
			});
			return { saved: true };
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Save failed.' });
		}
	}
};
