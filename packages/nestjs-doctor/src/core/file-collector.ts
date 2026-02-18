import { join } from "node:path";
import { glob } from "tinyglobby";
import type { NestjsDoctorConfig } from "../types/config.js";
import { DEFAULT_CONFIG } from "../types/config.js";
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

export async function collectMonorepoFiles(
	targetPath: string,
	monorepo: MonorepoInfo,
	config: NestjsDoctorConfig = {}
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>();

	for (const [name, root] of monorepo.projects) {
		const projectPath = join(targetPath, root);
		const files = await collectFiles(projectPath, config);
		result.set(name, files);
	}

	return result;
}
