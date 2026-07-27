#!/usr/bin/env node
/**
 * Converts the scan's JSON report into SARIF, reusing the installed package's
 * own builder rather than scanning a second time.
 *
 * Exits non-zero without writing anything when the report is unreadable, so the
 * caller skips the upload rather than publishing an empty result set — an empty
 * SARIF upload closes every existing code-scanning alert.
 *
 * Usage: render-sarif.mjs <apiEntry> <reportPath> <outputPath> <targetPath>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [, , apiEntry, reportPath, outputPath, targetPath] = process.argv;

let report;
try {
	report = JSON.parse(readFileSync(reportPath, "utf-8"));
} catch (error) {
	console.log(
		`::warning::nestjs-doctor could not read the JSON report for SARIF conversion (${error.message}). Skipping the SARIF output.`
	);
	process.exit(1);
}

try {
	const { buildSarifLog } = await import(pathToFileURL(apiEntry).href);
	const log = buildSarifLog(
		report,
		resolve(targetPath || "."),
		process.env.NESTJS_DOCTOR_VERSION || "0.0.0"
	);
	writeFileSync(outputPath, JSON.stringify(log), "utf-8");
} catch (error) {
	console.log(
		`::warning::nestjs-doctor could not build the SARIF report (${error.message}). Skipping the SARIF output.`
	);
	process.exit(1);
}
