import pc from "picocolors";
import type { DiagnoseResult } from "../../types/result.js";

export function printConsoleReport(
	result: DiagnoseResult,
	verbose: boolean,
): void {
	const { score, diagnostics, project, summary } = result;

	// Header
	console.log();
	console.log(pc.bold("nestjs-doctor") + "  " + pc.dim(`v0.1.0`));
	console.log(
		pc.dim(`Project: ${project.name}`) +
			(project.nestVersion
				? pc.dim(` | NestJS ${project.nestVersion}`)
				: "") +
			(project.orm ? pc.dim(` | ${project.orm}`) : ""),
	);
	console.log(
		pc.dim(
			`Files: ${project.fileCount} | Modules: ${project.moduleCount}`,
		),
	);
	console.log();

	// Score
	const scoreColor = getScoreColor(score.value);
	console.log(
		`  ${pc.bold("Score:")} ${scoreColor(String(score.value))} ${pc.dim(`/ 100`)} ${scoreColor(`(${score.label})`)}`,
	);
	console.log();

	if (diagnostics.length === 0) {
		console.log(pc.green("  No issues found!"));
		console.log();
		return;
	}

	// Summary
	console.log(pc.bold("  Summary:"));
	if (summary.errors > 0)
		console.log(`    ${pc.red(`${summary.errors} errors`)}`);
	if (summary.warnings > 0)
		console.log(`    ${pc.yellow(`${summary.warnings} warnings`)}`);
	if (summary.info > 0)
		console.log(`    ${pc.blue(`${summary.info} info`)}`);
	console.log();

	// Diagnostics
	if (verbose) {
		for (const d of diagnostics) {
			const sevColor = getSeverityColor(d.severity);
			const icon = getSeverityIcon(d.severity);
			console.log(
				`  ${sevColor(icon)} ${sevColor(d.severity)} ${pc.dim(`[${d.rule}]`)}`,
			);
			console.log(`    ${d.message}`);
			console.log(`    ${pc.dim(`${d.filePath}:${d.line}`)}`);
			console.log(`    ${pc.dim(`Help: ${d.help}`)}`);
			console.log();
		}
	} else {
		// Grouped by category
		const categories = ["security", "architecture", "correctness", "performance"] as const;
		for (const cat of categories) {
			const catDiagnostics = diagnostics.filter((d) => d.category === cat);
			if (catDiagnostics.length === 0) continue;

			console.log(`  ${pc.bold(cat.charAt(0).toUpperCase() + cat.slice(1))} (${catDiagnostics.length}):`);
			for (const d of catDiagnostics) {
				const sevColor = getSeverityColor(d.severity);
				const icon = getSeverityIcon(d.severity);
				console.log(
					`    ${sevColor(icon)} ${d.message} ${pc.dim(`[${d.rule}]`)}`,
				);
			}
			console.log();
		}
	}

	console.log(
		pc.dim("  Run with --verbose for file paths and line numbers"),
	);
	console.log();
}

function getScoreColor(score: number) {
	if (score >= 90) return pc.green;
	if (score >= 75) return pc.cyan;
	if (score >= 50) return pc.yellow;
	if (score >= 25) return pc.magenta;
	return pc.red;
}

function getSeverityColor(severity: string) {
	switch (severity) {
		case "error":
			return pc.red;
		case "warning":
			return pc.yellow;
		default:
			return pc.blue;
	}
}

function getSeverityIcon(severity: string): string {
	switch (severity) {
		case "error":
			return "x";
		case "warning":
			return "!";
		default:
			return "-";
	}
}
