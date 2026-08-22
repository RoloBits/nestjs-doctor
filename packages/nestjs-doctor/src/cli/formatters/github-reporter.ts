import { appendFileSync } from "node:fs";
import type { Diagnostic, Severity } from "../../common/diagnostic.js";
import { forSurface, isCodeDiagnostic } from "../../common/diagnostic.js";
import type { DiagnoseResult } from "../../common/result.js";
import { toRelativePath } from "../../engine/fingerprint.js";
import {
	buildMarkdownReport,
	type MarkdownReportOptions,
} from "../../formatters/markdown-report.js";

/** GitHub renders at most 10 per level per step and drops the rest. */
const MAX_ANNOTATIONS_PER_LEVEL = 10;

type AnnotationLevel = "error" | "warning" | "notice";

const LEVEL_BY_SEVERITY: Record<Severity, AnnotationLevel> = {
	error: "error",
	warning: "warning",
	info: "notice",
};

const PERCENT_RE = /%/g;
const CR_RE = /\r/g;
const LF_RE = /\n/g;
const COLON_RE = /:/g;
const COMMA_RE = /,/g;

/** Escapes a workflow-command message body. */
export function escapeCommandData(value: string): string {
	return value
		.replace(PERCENT_RE, "%25")
		.replace(CR_RE, "%0D")
		.replace(LF_RE, "%0A");
}

/** Escapes a workflow-command property value (`:` and `,` are delimiters). */
export function escapeCommandProperty(value: string): string {
	return escapeCommandData(value)
		.replace(COLON_RE, "%3A")
		.replace(COMMA_RE, "%2C");
}

function formatAnnotation(diagnostic: Diagnostic, targetPath: string): string {
	const level = LEVEL_BY_SEVERITY[diagnostic.severity];
	const properties = [
		`file=${escapeCommandProperty(toRelativePath(targetPath, diagnostic.filePath))}`,
		`title=${escapeCommandProperty(`nestjs-doctor(${diagnostic.rule})`)}`,
	];

	if (isCodeDiagnostic(diagnostic)) {
		properties.splice(
			1,
			0,
			`line=${diagnostic.line}`,
			`col=${diagnostic.column}`
		);
	}

	const body = escapeCommandData(
		`${diagnostic.message} ${diagnostic.help}`.trim()
	);
	return `::${level} ${properties.join(",")}::${body}`;
}

/** Workflow-command annotation lines for a result, capped per level. */
export function buildAnnotations(
	result: DiagnoseResult,
	targetPath: string
): string[] {
	const emitted: Record<AnnotationLevel, number> = {
		error: 0,
		warning: 0,
		notice: 0,
	};
	const lines: string[] = [];

	for (const diagnostic of forSurface(result.diagnostics, "prComment")) {
		const level = LEVEL_BY_SEVERITY[diagnostic.severity];
		if (emitted[level] >= MAX_ANNOTATIONS_PER_LEVEL) {
			continue;
		}
		emitted[level] += 1;
		lines.push(formatAnnotation(diagnostic, targetPath));
	}

	return lines;
}

/** Prints annotations and appends the markdown report to the job summary. */
export function reportToGitHubActions(
	result: DiagnoseResult,
	options: MarkdownReportOptions
): string {
	for (const line of buildAnnotations(result, options.targetPath)) {
		console.log(line);
	}

	const markdown = buildMarkdownReport(result, options);
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (summaryPath) {
		try {
			appendFileSync(summaryPath, `${markdown}\n`, "utf-8");
		} catch {
			// A read-only or absent summary file is not worth failing the run over.
		}
	}

	return markdown;
}
