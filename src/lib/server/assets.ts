// Lists the site's own image assets so the admin can pick one instead of
// typing a path from memory.
//
// The location differs between dev (static/) and the built server (adapter-node
// copies static/ to build/client/), so both are tried. If neither is readable
// the caller still gets a usable free-text field — this is a convenience, not
// a dependency.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = ['build/client', 'static'];
const DIRS = ['', 'images', 'images/certs', 'icons', 'icons/ui'];
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;

export async function listImageAssets(): Promise<string[]> {
	for (const root of ROOTS) {
		const found: string[] = [];
		let anyDirRead = false;

		for (const dir of DIRS) {
			try {
				const entries = await readdir(join(process.cwd(), root, dir), {
					withFileTypes: true
				});
				anyDirRead = true;
				for (const e of entries) {
					if (e.isFile() && IMAGE.test(e.name)) {
						found.push('/' + (dir ? `${dir}/${e.name}` : e.name));
					}
				}
			} catch {
				// directory absent in this layout — try the next one
			}
		}

		if (anyDirRead) return found.sort();
	}
	return [];
}
