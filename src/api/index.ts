import { resolve } from "node:path";
import { scan } from "../core/scanner.js";
import { getRules } from "../rules/index.js";

export { getRules };
export type { Rule, RuleMeta, RuleContext } from "../rules/types.js";
export type { Diagnostic, Severity, Category } from "../types/diagnostic.js";
export type { NestjsDoctorConfig } from "../types/config.js";
export type {
	DiagnoseResult,
	Score,
	ProjectInfo,
	DiagnoseSummary,
} from "../types/result.js";

export async function diagnose(
	path: string,
	options: { config?: string } = {},
) {
	const targetPath = resolve(path);
	return scan(targetPath, options);
}
