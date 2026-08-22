import { pathToFileURL } from "node:url";
import { type Diagnostic, onSurface, type Severity } from "nestjs-doctor";
import {
	DiagnosticSeverity,
	type Diagnostic as LspDiagnostic,
} from "vscode-languageserver";

const severityMap: Record<Severity, DiagnosticSeverity> = {
	error: DiagnosticSeverity.Error,
	warning: DiagnosticSeverity.Warning,
	info: DiagnosticSeverity.Information,
};

function toRange(line: number, column: number) {
	const l = Math.max(line - 1, 0);
	const c = Math.max(column - 1, 0);
	return { start: { line: l, character: c }, end: { line: l, character: c } };
}

function toLspDiagnostic(d: Diagnostic): LspDiagnostic {
	const range = "line" in d ? toRange(d.line, d.column) : toRange(1, 1);
	// A report-only rule shows as a hint, so it stays visible while you edit
	// without adding to the warning count beside real defects.
	const notScored = !onSurface(d, "score");
	return {
		range,
		severity: notScored ? DiagnosticSeverity.Hint : severityMap[d.severity],
		code: d.rule,
		source: "nestjs-doctor",
		message: d.message,
		data: { category: d.category, help: d.help, notScored },
	};
}

export function groupByFile(
	diagnostics: Diagnostic[],
	workspaceRoot: string
): Map<string, LspDiagnostic[]> {
	const grouped = new Map<string, LspDiagnostic[]>();

	for (const d of diagnostics) {
		const absolutePath = d.filePath.startsWith("/")
			? d.filePath
			: `${workspaceRoot}/${d.filePath}`;
		const uri = pathToFileURL(absolutePath).toString();

		let list = grouped.get(uri);
		if (!list) {
			list = [];
			grouped.set(uri, list);
		}
		list.push(toLspDiagnostic(d));
	}

	return grouped;
}
