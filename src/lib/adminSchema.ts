// Field schemas that drive the admin editor.
//
// One place describes every entity's editable shape, so /admin/[entity] can
// build a real form for any collection without a bespoke page per entity.
// Adding a field to the model means adding a line here — not a new screen.

import type { EntityName } from '$lib/types';

export type FieldType =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'number'
	| 'boolean'
	| 'date'
	| 'list' // comma-separated -> string[]
	| 'select';

export type Field = {
	name: string;
	label: string;
	type: FieldType;
	required?: boolean;
	options?: string[];
	help?: string;
	/** Shown in the list table. */
	column?: boolean;
};

export type EntitySchema = {
	label: string;
	/** Field used as the row title in listings. */
	titleField: string;
	fields: Field[];
};

const common: Field[] = [
	{ name: 'order', label: 'Order', type: 'number', help: 'Lower sorts first.' },
	{ name: 'isActive', label: 'Visible', type: 'boolean' }
];

export const SCHEMAS: Record<EntityName, EntitySchema> = {
	posts: {
		label: 'Blog posts',
		titleField: 'title',
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true, column: true },
			{
				name: 'slug',
				label: 'Slug',
				type: 'text',
				help: 'Left blank, generated from the title.',
				column: true
			},
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				options: ['draft', 'published'],
				column: true
			},
			{ name: 'excerpt', label: 'Excerpt', type: 'textarea' },
			{ name: 'coverImage', label: 'Cover image URL', type: 'text' },
			{ name: 'tags', label: 'Tags', type: 'list', help: 'Comma separated.' },
			{ name: 'body', label: 'Body', type: 'markdown', required: true },
			...common
		]
	},
	projects: {
		label: 'Projects',
		titleField: 'name',
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true, column: true },
			{ name: 'type', label: 'Type', type: 'text', column: true, help: 'e.g. MAIN_QUEST' },
			{ name: 'description', label: 'Description', type: 'textarea', required: true },
			{ name: 'tech', label: 'Tech', type: 'list' },
			{ name: 'redirect', label: 'Link', type: 'text' },
			{ name: 'completed', label: 'Completed', type: 'boolean' },
			...common
		]
	},
	companies: {
		label: 'Experience',
		titleField: 'name',
		fields: [
			{ name: 'name', label: 'Company', type: 'text', required: true, column: true },
			{ name: 'role', label: 'Role', type: 'text', required: true, column: true },
			{ name: 'period', label: 'Period', type: 'text', required: true, column: true },
			{ name: 'logo', label: 'Logo URL', type: 'text' },
			{ name: 'tech', label: 'Tech', type: 'list' },
			...common
		]
	},
	skills: {
		label: 'Skills',
		titleField: 'name',
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true, column: true },
			{ name: 'icon', label: 'Icon path', type: 'text', help: 'e.g. /icons/react.svg' },
			{ name: 'group', label: 'Group', type: 'text', column: true },
			...common
		]
	},
	credentials: {
		label: 'Credentials',
		titleField: 'title',
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true, column: true },
			{
				name: 'type',
				label: 'Type',
				type: 'select',
				options: ['CERTIFICATE', 'DEGREE'],
				column: true
			},
			{ name: 'institution', label: 'Institution', type: 'text', required: true, column: true },
			{ name: 'field', label: 'Field', type: 'text' },
			{ name: 'period', label: 'Period', type: 'text', required: true },
			{ name: 'url', label: 'Link', type: 'text' },
			{ name: 'image', label: 'Logo URL', type: 'text' },
			...common
		]
	},
	social: {
		label: 'Social links',
		titleField: 'name',
		fields: [
			{ name: 'name', label: 'Name', type: 'text', required: true, column: true },
			{ name: 'url', label: 'URL', type: 'text', required: true, column: true },
			{ name: 'handle', label: 'Handle', type: 'text' },
			{ name: 'icon', label: 'Icon path', type: 'text' },
			...common
		]
	},
	stats: {
		label: 'Stats',
		titleField: 'label',
		fields: [
			{ name: 'label', label: 'Label', type: 'text', required: true, column: true },
			{ name: 'value', label: 'Value', type: 'text', required: true, column: true },
			{ name: 'icon', label: 'Icon path', type: 'text' },
			...common
		]
	},
	sections: {
		label: 'Page sections',
		titleField: 'label',
		fields: [
			{
				name: 'key',
				label: 'Key',
				type: 'select',
				required: true,
				column: true,
				options: ['metrics', 'work', 'skills', 'projects', 'credentials', 'extras'],
				help: 'Which block this row renders. Fixed vocabulary.'
			},
			{ name: 'label', label: 'Heading', type: 'text', required: true, column: true },
			{ name: 'sub', label: 'Sub-heading', type: 'text' },
			...common
		]
	},
	extras: {
		label: 'Personal interests',
		titleField: 'title',
		fields: [
			{ name: 'title', label: 'Title', type: 'text', required: true, column: true },
			{ name: 'tag', label: 'Tag', type: 'text', column: true, help: 'e.g. GAME_DEV' },
			{ name: 'description', label: 'Description', type: 'textarea', required: true },
			{ name: 'icon', label: 'Icon path', type: 'text' },
			...common
		]
	}
};

export const ENTITY_ORDER: EntityName[] = [
	'sections',
	'posts',
	'projects',
	'companies',
	'skills',
	'credentials',
	'extras',
	'social',
	'stats'
];

/** Turn a submitted FormData value into the type the model expects. */
export function coerce(field: Field, raw: FormDataEntryValue | null): unknown {
	const value = typeof raw === 'string' ? raw : '';
	switch (field.type) {
		case 'number': {
			if (value.trim() === '') return undefined;
			const n = Number(value);
			return Number.isFinite(n) ? n : undefined;
		}
		case 'boolean':
			return value === 'on' || value === 'true';
		case 'list':
			return value
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		default:
			return value.trim() === '' ? undefined : value;
	}
}
