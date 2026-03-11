import { dirname, resolve } from "node:path";
import { ts } from "ts-morph";

export type PathAliasMap = Map<string, string[]>;

export function loadPathAliases(projectRoot: string): PathAliasMap {
	const aliases: PathAliasMap = new Map();

	try {
		const configPath = ts.findConfigFile(
			projectRoot,
			ts.sys.fileExists,
			"tsconfig.json"
		);
		if (!configPath) {
			return aliases;
		}

		const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
		if (error || !config) {
			return aliases;
		}

		const configDir = dirname(configPath);
		const parsed = ts.parseJsonConfigFileContent(config, ts.sys, configDir);
		const paths = parsed.options.paths;
		if (!paths) {
			return aliases;
		}

		const baseUrl = parsed.options.baseUrl ?? configDir;

		for (const [pattern, targets] of Object.entries(paths)) {
			const resolved = targets.map((target) => resolve(baseUrl, target));
			aliases.set(pattern, resolved);
		}
	} catch {
		return aliases;
	}

	return aliases;
}

export function resolvePathAlias(
	specifier: string,
	aliases: PathAliasMap
): string | undefined {
	for (const [pattern, targets] of aliases) {
		if (targets.length === 0) {
			continue;
		}

		const wildcardIndex = pattern.indexOf("*");

		if (wildcardIndex === -1) {
			// Exact match
			if (specifier === pattern) {
				return targets[0];
			}
			continue;
		}

		// Wildcard match: split into prefix and suffix around "*"
		const prefix = pattern.slice(0, wildcardIndex);
		const suffix = pattern.slice(wildcardIndex + 1);

		if (
			specifier.startsWith(prefix) &&
			specifier.endsWith(suffix) &&
			specifier.length >= prefix.length + suffix.length
		) {
			const captured = specifier.slice(
				prefix.length,
				specifier.length - suffix.length
			);
			const target = targets[0];
			const targetWildcard = target.indexOf("*");
			if (targetWildcard === -1) {
				return target;
			}
			return (
				target.slice(0, targetWildcard) +
				captured +
				target.slice(targetWildcard + 1)
			);
		}
	}

	return undefined;
}
