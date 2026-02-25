import { pathToFileURL } from "node:url";
import type { Diagnostic, Severity } from "nestjs-doctor";
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
	return {
		range: toRange(d.line, d.column),
		severity: severityMap[d.severity],
		code: d.rule,
		source: "nestjs-doctor",
		message: d.message,
		data: { help: d.help, category: d.category },
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
