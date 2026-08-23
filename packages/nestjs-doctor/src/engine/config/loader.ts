import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	DEFAULT_CONFIG,
	type NestjsDoctorConfig,
} from "../../common/config.js";

const CONFIG_FILENAMES = ["nestjs-doctor.config.json", ".nestjs-doctor.json"];

function isMissingFile(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** The config a directory declares, or `null` when it declares none. */
export async function findConfig(
	targetPath: string
): Promise<NestjsDoctorConfig | null> {
	for (const filename of CONFIG_FILENAMES) {
		try {
			return await readConfigFile(join(targetPath, filename));
		} catch (error) {
			// A file that exists but will not parse is an error, not an absence.
			if (!isMissingFile(error)) {
				throw error;
			}
		}
	}

	try {
		const pkgRaw = await readFile(join(targetPath, "package.json"), "utf-8");
		const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
		if (pkg["nestjs-doctor"] && typeof pkg["nestjs-doctor"] === "object") {
			return mergeConfig(pkg["nestjs-doctor"] as NestjsDoctorConfig);
		}
	} catch {
		// No package.json or no key
	}

	return null;
}

export async function loadConfig(
	targetPath: string,
	configPath?: string
): Promise<NestjsDoctorConfig> {
	if (configPath) {
		return readConfigFile(configPath);
	}
	return (await findConfig(targetPath)) ?? { ...DEFAULT_CONFIG };
}

async function readConfigFile(path: string): Promise<NestjsDoctorConfig> {
	const raw = await readFile(path, "utf-8");
	let parsed: NestjsDoctorConfig;
	try {
		parsed = JSON.parse(raw) as NestjsDoctorConfig;
	} catch {
		throw new Error(
			`${path} is not valid JSON. A trailing comma or a comment makes the whole file unreadable.`
		);
	}
	return mergeConfig(parsed);
}

/**
 * Merges user config with defaults.
 *
 * Merge semantics:
 * - `include`: user replaces defaults entirely (user likely wants a specific scope)
 * - `exclude`: user values are appended to defaults (additive, keeps safe defaults)
 * - `ignore.rules`: user replaces defaults (no default ignored rules)
 * - `ignore.files`: user replaces defaults (no default ignored files)
 * - `rules`, `categories`: shallow-merged with user taking precedence
 */
function mergeConfig(userConfig: NestjsDoctorConfig): NestjsDoctorConfig {
	return {
		...DEFAULT_CONFIG,
		...userConfig,
		exclude: [...(DEFAULT_CONFIG.exclude ?? []), ...(userConfig.exclude ?? [])],
	};
}

/**
 * Config for one package of a monorepo: its own if it declares one, otherwise
 * the root's.
 */
export async function loadConfigWithFallback(
	projectPath: string,
	fallback: NestjsDoctorConfig
): Promise<NestjsDoctorConfig> {
	return (await findConfig(projectPath)) ?? fallback;
}
