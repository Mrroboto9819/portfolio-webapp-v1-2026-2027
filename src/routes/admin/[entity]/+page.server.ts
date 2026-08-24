import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SCHEMAS, coerce, searchFieldsFor } from '$lib/adminSchema';
import { LOCALES, TRANSLATABLE } from '$lib/i18n';
import { getRepo, isEntityName } from '$lib/server/repositories';

function schemaFor(name: string) {
	if (!isEntityName(name)) error(404, `Unknown entity '${name}'`);
	return { entity: name, schema: SCHEMAS[name], repo: getRepo(name) };
}

export const load: PageServerLoad = async ({ params, url }) => {
	const { entity, schema, repo } = schemaFor(params.entity);

	// List state lives in the URL so it survives refresh, the back button and
	// being shared — and so the slicing happens in Mongo, not the browser.
	const paged = await repo.paginate({
		page: Number(url.searchParams.get('page') ?? 1) || 1,
		perPage: Number(url.searchParams.get('perPage') ?? 20) || 20,
		sort: url.searchParams.get('sort') || 'order',
		dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc',
		search: url.searchParams.get('q') ?? undefined,
		searchFields: searchFieldsFor(entity),
		activeOnly: false // the admin edits hidden rows and drafts too
	});

	return {
		entity,
		schema,
		...paged,
		sort: url.searchParams.get('sort') || 'order',
		dir: (url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
		q: url.searchParams.get('q') ?? ''
	};
};

async function patchFrom(request: Request, entity: string) {
	const form = await request.formData();
	const { fields } = SCHEMAS[entity as keyof typeof SCHEMAS];
	const translatable = new Set(TRANSLATABLE[entity] ?? []);
	const patch: Record<string, unknown> = {};

	for (const field of fields) {
		// Translatable fields arrive as name__en / name__es and are reassembled
		// into { en, es }. A locale left blank is omitted rather than stored as
		// an empty string, so `t()` falls back instead of rendering nothing.
		if (translatable.has(field.name)) {
			const value: Record<string, string> = {};
			for (const loc of LOCALES) {
				const raw = String(form.get(`${field.name}__${loc}`) ?? '').trim();
				if (raw) value[loc] = raw;
			}
			if (Object.keys(value).length) patch[field.name] = value;
			else patch[field.name] = undefined;
			continue;
		}

		const value = coerce(field, form.get(field.name));
		// A false boolean is a real value, not an omission — an unchecked box
		// must be written, or a row could never be hidden again.
		if (value !== undefined || field.type === 'boolean') patch[field.name] = value;
	}
	return { patch, id: String(form.get('id') ?? '') };
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const { entity, repo, schema } = schemaFor(params.entity);
		const { patch, id } = await patchFrom(request, entity);

		for (const f of schema.fields) {
			const v = patch[f.name];
			const empty =
				v === undefined ||
				v === null ||
				v === '' ||
				(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
			if (f.required && empty) return fail(400, { message: `${f.label} is required.` });
		}

		try {
			const saved = id ? await repo.update(id, patch) : await repo.create(patch);
			if (!saved) return fail(404, { message: 'Record not found.' });
			return { saved: true, id: saved.id };
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Save failed.' });
		}
	},

	/**
	 * Flip a boolean field straight from the table.
	 *
	 * A separate action rather than a full save: it touches exactly one field,
	 * so it cannot blank out the rest of the record the way submitting a
	 * partially-populated edit form would.
	 */
	toggle: async ({ request, params }) => {
		const { repo, schema } = schemaFor(params.entity);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const fieldName = String(form.get('field') ?? 'isActive');
		const next = String(form.get('next') ?? '') === 'true';

		if (!id) return fail(400, { message: 'Missing id.' });
		// Only fields the schema declares as booleans may be toggled, so this
		// cannot be used to write arbitrary keys.
		const known =
			fieldName === 'isActive' ||
			schema.fields.some((f) => f.name === fieldName && f.type === 'boolean');
		if (!known) return fail(400, { message: `'${fieldName}' is not a toggleable field.` });

		const updated = await repo.update(id, { [fieldName]: next });
		if (!updated) return fail(404, { message: 'Record not found.' });
		return { toggled: true };
	},

	remove: async ({ request, params }) => {
		const { repo } = schemaFor(params.entity);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing id.' });
		const ok = await repo.remove(id);
		if (!ok) return fail(404, { message: 'Record not found.' });
		return { removed: true };
	}
};
