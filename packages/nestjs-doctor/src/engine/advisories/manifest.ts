import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const BACKSLASH_RE = /\\/g;

/** How far either walk climbs before giving up. */
export const MAX_WALK = 8;

export type DependencyBlock = "dependencies" | "devDependencies";

export interface Declaration {
	block: DependencyBlock;
	spec: string;
}

export interface Manifest {
	/** Posix path of the package.json the versions came from. */
	path: string;
	/** Set when the file was found but could not be parsed. */
	unreadable?: true;
	/** Keyed by package name, from the two blocks npm installs. */
	versions: Record<string, Declaration>;
}

/** The nearest package.json at or above a path. */
export function findManifest(targetPath: string): Manifest | null {
	let current = resolve(targetPath);

	for (let depth = 0; depth < MAX_WALK; depth++) {
		const candidate = join(current, "package.json");
		if (existsSync(candidate)) {
			try {
				const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as Partial<
					Record<DependencyBlock, Record<string, string>>
				>;
				const versions: Record<string, Declaration> = {};
				// dependencies is written last, so it overwrites devDependencies.
				for (const block of ["devDependencies", "dependencies"] as const) {
					for (const [name, spec] of Object.entries(pkg[block] ?? {})) {
						versions[name] = { block, spec };
					}
				}
				return { path: candidate.replace(BACKSLASH_RE, "/"), versions };
			} catch {
				return {
					path: candidate.replace(BACKSLASH_RE, "/"),
					versions: {},
					unreadable: true,
				};
			}
		}

		if (existsSync(join(current, ".git"))) {
			return null;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
	return null;
}
