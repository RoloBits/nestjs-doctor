import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const BACKSLASH_RE = /\\/g;

export interface Manifest {
	/** Posix path of the package.json the versions came from. */
	path: string;
	/** dependencies and devDependencies only; a peer range constrains a consumer. */
	versions: Record<string, string>;
}

/**
 * The nearest package.json at or above a path. Read when the rule runs, so an
 * editor session cannot hold a version the file no longer declares.
 */
export function findManifest(targetPath: string): Manifest | null {
	let current = resolve(targetPath);

	for (;;) {
		const candidate = join(current, "package.json");
		if (existsSync(candidate)) {
			try {
				const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as {
					dependencies?: Record<string, string>;
					devDependencies?: Record<string, string>;
				};
				return {
					path: candidate.replace(BACKSLASH_RE, "/"),
					versions: { ...pkg.dependencies, ...pkg.devDependencies },
				};
			} catch {
				return null;
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
}
