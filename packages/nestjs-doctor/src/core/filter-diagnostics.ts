import type { NestjsDoctorConfig } from "../types/config.js";
import type { Diagnostic } from "../types/diagnostic.js";
import { compileGlobPattern } from "./match-glob-pattern.js";

export const filterIgnoredDiagnostics = (
	diagnostics: Diagnostic[],
	config: NestjsDoctorConfig
): Diagnostic[] => {
	const ignoredRules = new Set(
		Array.isArray(config.ignore?.rules) ? config.ignore.rules : []
	);
	const ignoredFilePatterns = Array.isArray(config.ignore?.files)
		? config.ignore.files.map(compileGlobPattern)
		: [];

	if (ignoredRules.size === 0 && ignoredFilePatterns.length === 0) {
		return diagnostics;
	}

	return diagnostics.filter((diagnostic) => {
		if (ignoredRules.has(diagnostic.rule)) {
			return false;
		}

		const normalizedPath = diagnostic.filePath.replace(/\\/g, "/");
		if (ignoredFilePatterns.some((pattern) => pattern.test(normalizedPath))) {
			return false;
		}

		return true;
	});
};
