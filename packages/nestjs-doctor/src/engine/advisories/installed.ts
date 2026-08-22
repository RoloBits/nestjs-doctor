import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_WALK = 8;
const TOP_LEVEL_KEY = /^\s{0,2}"/;
const JSON_KEY = /^\s*"([^"]+)"\s*:/;

/**
 * The version on disk for a package, or null when nothing is installed.
 * Walks up from the manifest so a hoisted workspace `node_modules` is found.
 */
export function installedVersion(
	manifestDir: string,
	packageName: string
): string | null {
	let current = manifestDir;

	for (let depth = 0; depth < MAX_WALK; depth++) {
		const candidate = join(
			current,
			"node_modules",
			packageName,
			"package.json"
		);
		if (existsSync(candidate)) {
			try {
				const version = (
					JSON.parse(readFileSync(candidate, "utf-8")) as {
						version?: unknown;
					}
				).version;
				return typeof version === "string" ? version : null;
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
	return null;
}

/**
 * 1-based line of a dependency key inside its own block, so the line agrees
 * with the version reported. Falls back to line 1.
 */
export function dependencyLine(
	manifestPath: string,
	block: string,
	packageName: string
): number {
	try {
		const lines = readFileSync(manifestPath, "utf-8").split("\n");
		let inBlock = false;
		for (let i = 0; i < lines.length; i++) {
			const key = lines[i].match(JSON_KEY)?.[1];
			if (!key) {
				continue;
			}
			if (key === block) {
				inBlock = true;
				continue;
			}
			if (inBlock && key === packageName) {
				return i + 1;
			}
			// Any other top-level key ends the block we were walking.
			if (inBlock && TOP_LEVEL_KEY.test(lines[i])) {
				inBlock = false;
			}
		}
	} catch {
		// An unreadable manifest just means the finding sits on line 1.
	}
	return 1;
}
