#!/usr/bin/env node
/**
 * Reads the scan's JSON report and exposes its headline numbers as step outputs.
 *
 * A crashed or aborted scan leaves a truncated (or empty) file, so every field
 * is treated as optional: the action still renders, comments, and gates rather
 * than failing on a parse error and losing the reason the scan died.
 *
 * Usage: read-report.mjs <reportPath>
 */
import { appendFileSync, readFileSync } from "node:fs";

const setOutput = (name, value) => {
	const file = process.env.GITHUB_OUTPUT;
	const line = `${name}=${value}\n`;
	if (file) {
		appendFileSync(file, line);
	} else {
		process.stdout.write(line);
	}
};

const reportPath = process.argv[2];

let report = null;
try {
	report = JSON.parse(readFileSync(reportPath, "utf-8"));
} catch {
	report = null;
}

const summary = report?.summary ?? {};
const diagnostics = Array.isArray(report?.diagnostics)
	? report.diagnostics
	: [];
const affectedFiles = new Set(
	diagnostics.map((diagnostic) => diagnostic?.filePath).filter(Boolean)
);

setOutput("score", report?.score?.value ?? "");
setOutput("label", report?.score?.label ?? "");
setOutput("total-issues", summary.total ?? 0);
setOutput("error-count", summary.errors ?? 0);
setOutput("warning-count", summary.warnings ?? 0);
setOutput("info-count", summary.info ?? 0);
setOutput("affected-files", affectedFiles.size);
setOutput("fixed-issues", report?.scope?.fixed ?? 0);
setOutput("scope", report?.scope?.mode ?? "full");
setOutput("degraded-from", report?.scope?.degradedFrom ?? "");
setOutput("ok", report ? "true" : "false");
