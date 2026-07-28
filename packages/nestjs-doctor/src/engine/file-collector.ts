import { join } from "node:path";
import { glob } from "tinyglobby";
import type { NestjsDoctorConfig } from "../common/config.js";
import { DEFAULT_CONFIG } from "../common/config.js";
import type { MonorepoInfo } from "./project-detector.js";

export async function collectFiles(
	targetPath: string,
	config: NestjsDoctorConfig = {}
): Promise<string[]> {
	const include = config.include ?? DEFAULT_CONFIG.include!;
	const exclude = config.exclude ?? DEFAULT_CONFIG.exclude!;

	const files = await glob(include, {
		cwd: targetPath,
		absolute: true,
		ignore: exclude,
	});

	return files.sort();
}

const TRAILING_SLASH_RE = /\/+$/;

/** Project roots are posix and relative to the workspace; "." means the root itself. */
function normaliseRoot(root: string): string {
	const trimmed = root.replace(TRAILING_SLASH_RE, "");
	return trimmed === "." ? "" : trimmed;
}

/**
 * Glob patterns excluding every project root nested under `root`, so a file
 * belongs to the innermost project that claims it rather than to both.
 */
function nestedRootPatterns(root: string, allRoots: string[]): string[] {
	const parent = normaliseRoot(root);
	const patterns: string[] = [];

	for (const other of allRoots) {
		const child = normaliseRoot(other);
		if (child === parent) {
			continue;
		}
		const nested =
			parent === "" ? child !== "" : child.startsWith(`${parent}/`);
		if (!nested) {
			continue;
		}
		const suffix = parent === "" ? child : child.slice(parent.length + 1);
		patterns.push(`${suffix}/**`);
	}

	return patterns;
}

export async function collectMonorepoFiles(
	targetPath: string,
	monorepo: MonorepoInfo,
	config: NestjsDoctorConfig = {}
): Promise<Map<string, string[]>> {
	const allRoots = [...monorepo.projects.values()];
	const entries = await Promise.all(
		[...monorepo.projects.entries()].map(async ([name, root]) => {
			const projectPath = join(targetPath, root);
			const nested = nestedRootPatterns(root, allRoots);
			const scoped =
				nested.length === 0
					? config
					: {
							...config,
							exclude: [
								...(config.exclude ?? DEFAULT_CONFIG.exclude!),
								...nested,
							],
						};
			const files = await collectFiles(projectPath, scoped);
			return [name, files] as const;
		})
	);

	const result = new Map<string, string[]>();
	for (const [name, files] of entries) {
		result.set(name, files);
	}

	return result;
}
