import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG, type NestjsDoctorConfig } from "../types/config.js";

const CONFIG_FILENAMES = [
	"nestjs-doctor.config.json",
	".nestjs-doctor.json",
];

export async function loadConfig(
	targetPath: string,
	configPath?: string,
): Promise<NestjsDoctorConfig> {
	if (configPath) {
		return readConfigFile(configPath);
	}

	// Try known config file names
	for (const filename of CONFIG_FILENAMES) {
		try {
			return await readConfigFile(join(targetPath, filename));
		} catch {
			// File doesn't exist, try next
		}
	}

	// Try package.json "nestjs-doctor" key
	try {
		const pkgRaw = await readFile(join(targetPath, "package.json"), "utf-8");
		const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
		if (pkg["nestjs-doctor"] && typeof pkg["nestjs-doctor"] === "object") {
			return mergeConfig(pkg["nestjs-doctor"] as NestjsDoctorConfig);
		}
	} catch {
		// No package.json or no key
	}

	return { ...DEFAULT_CONFIG };
}

async function readConfigFile(path: string): Promise<NestjsDoctorConfig> {
	const raw = await readFile(path, "utf-8");
	const parsed = JSON.parse(raw) as NestjsDoctorConfig;
	return mergeConfig(parsed);
}

function mergeConfig(userConfig: NestjsDoctorConfig): NestjsDoctorConfig {
	return {
		...DEFAULT_CONFIG,
		...userConfig,
		exclude: [
			...(DEFAULT_CONFIG.exclude ?? []),
			...(userConfig.exclude ?? []),
		],
	};
}
