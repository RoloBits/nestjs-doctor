#!/usr/bin/env node
/**
 * Renders the scan's JSON report into the markdown the action posts.
 *
 * The renderer is imported from the installed `nestjs-doctor` package rather
 * than reimplemented here, so the pull request comment, the job summary, and
 * `nestjs-doctor --format markdown` can never drift apart. If the import fails
 * (a broken install, a version predating the export) a plain fallback is
 * written instead — a run must still report something.
 *
 * Usage: render-comment.mjs <apiEntry> <reportPath> <outputPath>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FALLBACK_MARKER = "<!-- nestjs-doctor:summary -->";

const [, , apiEntry, reportPath, outputPath] = process.argv;

let report = null;
try {
	report = JSON.parse(readFileSync(reportPath, "utf-8"));
} catch {
	report = null;
}

const fallback = (reason) =>
	[
		FALLBACK_MARKER,
		"## 🩺 nestjs-doctor",
		"",
		`The scan did not produce a readable report (${reason}). See the workflow logs for details.`,
		"",
	].join("\n");

async function render() {
	if (!report) {
		return fallback("no JSON output");
	}

	// Opting out of the degraded-scope warning drops the flag the renderer keys
	// on; the reported scope itself is untouched, so the comment still says which
	// scope produced it.
	if (
		process.env.NESTJS_DOCTOR_SILENCE_BASELINE_WARNING === "true" &&
		report.scope?.degradedFrom
	) {
		report.scope.degradedFrom = undefined;
	}

	// The scan only ever saw the filtered list, so the pre-filter total has to
	// come from the step that did the filtering.
	const total = Number(process.env.NESTJS_DOCTOR_CHANGED_TOTAL);
	if (report.scope && Number.isFinite(total) && total > 0) {
		report.scope.changedFilesTotal = total;
	}

	try {
		const api = await import(pathToFileURL(apiEntry).href);
		return api.buildMarkdownReport(report, {
			targetPath: process.env.NESTJS_DOCTOR_TARGET_PATH || ".",
			version: process.env.NESTJS_DOCTOR_VERSION || "",
			commitSha: process.env.NESTJS_DOCTOR_HEAD_SHA || undefined,
			runUrl: process.env.NESTJS_DOCTOR_RUN_URL || undefined,
			scope: report.scope,
		});
	} catch (error) {
		return fallback(error instanceof Error ? error.message : String(error));
	}
}

const markdown = await render();
writeFileSync(outputPath, markdown, "utf-8");

// Mirror it into the job summary so every event — including pushes to the
// default branch, where no pull request comment exists — has a visible result.
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
	try {
		writeFileSync(summaryPath, `${markdown}\n`, { flag: "a" });
	} catch {
		// A read-only summary file is not worth failing the run over.
	}
}
