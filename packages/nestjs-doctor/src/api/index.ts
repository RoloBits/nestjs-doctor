import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { scan, scanMonorepo } from "../core/scanner.js";
import { ValidationError } from "../types/errors.js";

export type { ScanContext } from "../core/scanner.js";
// biome-ignore lint/performance/noBarrelFile: this is the public API surface
export {
	prepareScan,
	scanAllFiles,
	scanFile,
	scanProject,
	updateFile,
} from "../core/scanner.js";
export { getRules } from "../rules/index.js";
export type {
	AnyRule,
	ProjectRule,
	ProjectRuleContext,
	Rule,
	RuleContext,
	RuleMeta,
} from "../rules/types.js";
export type { NestjsDoctorConfig } from "../types/config.js";
export type { Category, Diagnostic, Severity } from "../types/diagnostic.js";
export {
	ConfigurationError,
	NestjsDoctorError,
	ScanError,
	ValidationError,
} from "../types/errors.js";
export type {
	DiagnoseResult,
	DiagnoseSummary,
	MonorepoResult,
	ProjectInfo,
	RuleErrorInfo,
	Score,
	SubProjectResult,
} from "../types/result.js";

function validatePath(path: string): string {
	if (!path || path.trim() === "") {
		throw new ValidationError(
			"Path must be a non-empty string. Received an empty path."
		);
	}

	const resolved = resolve(path);

	if (!existsSync(resolved)) {
		throw new ValidationError(`Path does not exist: ${resolved}`);
	}

	const stat = statSync(resolved);
	if (!stat.isDirectory()) {
		throw new ValidationError(
			`Path must be a directory, not a file: ${resolved}`
		);
	}

	return resolved;
}

/**
 * Scans a single NestJS project and returns a health diagnostic result.
 *
 * @param path - Path to the NestJS project root directory.
 * @param options - Optional configuration: `config` specifies a path to a config file.
 * @returns A `DiagnoseResult` containing the health score, diagnostics, and summary.
 * @throws {ValidationError} If the path is empty, doesn't exist, or isn't a directory.
 */
export async function diagnose(
	path: string,
	options: { config?: string } = {}
) {
	const targetPath = validatePath(path);
	const { result } = await scan(targetPath, options);
	return result;
}

/**
 * Scans a NestJS monorepo and returns per-project and combined diagnostics.
 *
 * Auto-detects monorepo structure from `nest-cli.json`. If the target is not a
 * monorepo, falls back to a single-project scan wrapped in the monorepo result format.
 *
 * @param path - Path to the monorepo root directory.
 * @param options - Optional configuration: `config` specifies a path to a config file.
 * @returns A `MonorepoResult` with sub-project results and combined score.
 * @throws {ValidationError} If the path is empty, doesn't exist, or isn't a directory.
 */
export async function diagnoseMonorepo(
	path: string,
	options: { config?: string } = {}
) {
	const targetPath = validatePath(path);
	const { result } = await scanMonorepo(targetPath, options);
	return result;
}
