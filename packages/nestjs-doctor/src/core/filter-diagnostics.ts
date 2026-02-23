import type { NestjsDoctorConfig } from "../types/config.js";
import type { Diagnostic } from "../types/diagnostic.js";
import { compileGlobPattern } from "./match-glob-pattern.js";

const BACKSLASH_RE = /\\/g;
const TRAILING_SLASH_RE = /\/$/;

export const filterIgnoredDiagnostics = (
	diagnostics: Diagnostic[],
	config: NestjsDoctorConfig,
	targetPath: string
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

	const normalizedTarget = targetPath
		.replace(BACKSLASH_RE, "/")
		.replace(TRAILING_SLASH_RE, "");

	return diagnostics.filter((diagnostic) => {
		if (ignoredRules.has(diagnostic.rule)) {
			return false;
		}

		const normalizedPath = diagnostic.filePath.replace(BACKSLASH_RE, "/");
		const relativePath = normalizedPath.startsWith(`${normalizedTarget}/`)
			? normalizedPath.slice(normalizedTarget.length + 1)
			: normalizedPath;

		if (ignoredFilePatterns.some((pattern) => pattern.test(relativePath))) {
			return false;
		}

		return true;
	});
};
