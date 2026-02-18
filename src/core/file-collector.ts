import { glob } from "tinyglobby";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { NestjsDoctorConfig } from "../types/config.js";

export async function collectFiles(
	targetPath: string,
	config: NestjsDoctorConfig = {},
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
