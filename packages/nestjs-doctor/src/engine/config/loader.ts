import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	DEFAULT_CONFIG,
	type NestjsDoctorConfig,
} from "../../common/config.js";

const CONFIG_FILENAMES = ["nestjs-doctor.config.json", ".nestjs-doctor.json"];

/**
 * Reads the config a directory declares, or `null` when it declares none.
 *
 * The nullable return is what lets callers tell "this project opted into the
 * defaults" apart from "this project said nothing" — a distinction sub-project
 * resolution depends on.
 */
export async function findConfig(
	targetPath: string
): Promise<NestjsDoctorConfig | null> {
	for (const filename of CONFIG_FILENAMES) {
		try {
			return await readConfigFile(join(targetPath, filename));
		} catch {
			// File doesn't exist, try next
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
	const parsed = JSON.parse(raw) as NestjsDoctorConfig;
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
 * Config for one package of a monorepo.
 *
 * A package that ships its own config keeps full control; one that ships none
 * inherits the root's. Before this, a root `nestjs-doctor.config.json` (or
 * `--config`) was loaded and then silently dropped for every sub-project,
 * because `loadConfig` swallows a missing file and returns the defaults rather
 * than throwing.
 */
export async function loadConfigWithFallback(
	projectPath: string,
	fallback: NestjsDoctorConfig
): Promise<NestjsDoctorConfig> {
	try {
		return (await findConfig(projectPath)) ?? fallback;
	} catch {
		return fallback;
	}
}
