import type { DiagnoseResult, MonorepoResult } from "../../common/result.js";
import { buildCodeQualityReport } from "../../formatters/gitlab-report.js";
import { buildMarkdownReport } from "../../formatters/markdown-report.js";
import { buildSarifLog } from "../../formatters/sarif-report.js";
import { reportToGitHubActions } from "./github-reporter.js";

/** Machine-readable shapes the CLI can emit in place of the console report. */
export type OutputFormat =
	| "console"
	| "json"
	| "report-json"
	| "sarif"
	| "gitlab"
	| "markdown"
	| "github";

export const OUTPUT_FORMATS: OutputFormat[] = [
	"console",
	"json",
	"report-json",
	"sarif",
	"gitlab",
	"markdown",
	"github",
];

export function isOutputFormat(value: string): value is OutputFormat {
	return (OUTPUT_FORMATS as string[]).includes(value);
}

export const validateFormatArg = (raw: string): string | null =>
	isOutputFormat(raw)
		? null
		: `Invalid --format value: "${raw}". Must be one of ${OUTPUT_FORMATS.join(", ")}.`;

/** Formats that replace the console report. `github` is additive, so not one. */
export const isMachineReadableFormat = (format: OutputFormat): boolean =>
	format !== "console" && format !== "github";

interface RenderContext {
	commitSha?: string;
	jsonCompact: boolean;
	monorepo?: MonorepoResult;
	runUrl?: string;
	targetPath: string;
	version: string;
	warnings: string[];
}

export const stringifyJson = (value: unknown, compact: boolean): string =>
	compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);

/** Renders a result, returning the payload to write. `null` for `console`. */
export function renderResult(
	format: OutputFormat,
	result: DiagnoseResult,
	context: RenderContext
): string | null {
	const markdownOptions = {
		commitSha: context.commitSha,
		monorepo: context.monorepo,
		runUrl: context.runUrl,
		scope: result.scope,
		targetPath: context.targetPath,
		version: context.version,
		warnings: context.warnings,
	};

	switch (format) {
		case "json":
			return stringifyJson(result, context.jsonCompact);
		case "sarif":
			return stringifyJson(
				buildSarifLog(result, context.targetPath, context.version),
				context.jsonCompact
			);
		case "gitlab":
			return stringifyJson(
				buildCodeQualityReport(result, context.targetPath),
				context.jsonCompact
			);
		case "markdown":
			return buildMarkdownReport(result, markdownOptions);
		case "github":
			return reportToGitHubActions(result, markdownOptions);
		default:
			return null;
	}
}
