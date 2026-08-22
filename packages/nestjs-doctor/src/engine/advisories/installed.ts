import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_WALK = 8;
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
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
	return null;
}

const KEY_LINE_CACHE = new Map<string, Map<string, number>>();

/** 1-based line of a dependency key in a manifest, or 1 when not found. */
export function dependencyLine(
	manifestPath: string,
	packageName: string
): number {
	let lines = KEY_LINE_CACHE.get(manifestPath);
	if (!lines) {
		lines = new Map();
		try {
			const text = readFileSync(manifestPath, "utf-8").split("\n");
			for (let i = 0; i < text.length; i++) {
				const match = text[i].match(JSON_KEY);
				if (match && !lines.has(match[1])) {
					lines.set(match[1], i + 1);
				}
			}
		} catch {
			// An unreadable manifest just means every finding sits on line 1.
		}
		KEY_LINE_CACHE.set(manifestPath, lines);
	}
	return lines.get(packageName) ?? 1;
}
