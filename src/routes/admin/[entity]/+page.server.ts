import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SCHEMAS, coerce } from '$lib/adminSchema';
import { getRepo, isEntityName } from '$lib/server/repositories';

function schemaFor(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return { entity: name, schema: SCHEMAS[name], repo: getRepo(name) };
}

export const load: PageServerLoad = async ({ params }) => {
	const { entity, schema, repo } = schemaFor(params.entity);
	// activeOnly:false so hidden rows and drafts are editable, not invisible.
	const items = await repo.list({ activeOnly: false });
	return { entity, schema, items };
};

/** Build a patch from the submitted form using the entity's field schema. */
async function patchFrom(request: Request, entity: string) {
	const form = await request.formData();
	const { fields } = SCHEMAS[entity as keyof typeof SCHEMAS];
	const patch: Record<string, unknown> = {};

	for (const field of fields) {
		const value = coerce(field, form.get(field.name));
		// Booleans must be written even when false — an unchecked box is a real
		// value, not an omission.
		if (value !== undefined || field.type === 'boolean') patch[field.name] = value;
	}
	return { patch, id: String(form.get('id') ?? '') };
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const { entity, repo, schema } = schemaFor(params.entity);
		const { patch, id } = await patchFrom(request, entity);

		for (const f of schema.fields) {
			if (f.required && !patch[f.name]) {
				return fail(400, { message: `${f.label} is required.` });
			}
		}

		try {
			const saved = id ? await repo.update(id, patch) : await repo.create(patch);
			if (!saved) return fail(404, { message: 'Record not found.' });
			return { saved: true, id: saved.id };
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Save failed.' });
		}
	},

	remove: async ({ request, params }) => {
		const { repo } = schemaFor(params.entity);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing id.' });

		const ok = await repo.remove(id);
		if (!ok) return fail(404, { message: 'Record not found.' });
		return { removed: true };
	}
};
