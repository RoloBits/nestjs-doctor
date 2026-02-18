import { resolve } from "node:path";
import { scan } from "../core/scanner.js";

// biome-ignore lint/performance/noBarrelFile: this is the public API surface
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
export type {
	DiagnoseResult,
	DiagnoseSummary,
	ProjectInfo,
	Score,
} from "../types/result.js";

export async function diagnose(
	path: string,
	options: { config?: string } = {}
) {
	const targetPath = resolve(path);
	return await scan(targetPath, options);
}
