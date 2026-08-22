import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostic, DiagnosticSurface, Severity } from "nestjs-doctor";
import {
	DiagnosticSeverity,
	type Diagnostic as LspDiagnostic,
} from "vscode-languageserver";

const severityMap: Record<Severity, DiagnosticSeverity> = {
	error: DiagnosticSeverity.Error,
	warning: DiagnosticSeverity.Warning,
	info: DiagnosticSeverity.Information,
};

/** Inlined rather than imported: nestjs-doctor is resolved from the user's
 *  workspace, so the server bundle must not require it. */
const on = (d: Diagnostic, surface: DiagnosticSurface): boolean =>
	d.surfaces?.includes(surface) ?? true;

function toRange(line: number, column: number) {
	const l = Math.max(line - 1, 0);
	const c = Math.max(column - 1, 0);
	return { start: { line: l, character: c }, end: { line: l, character: c } };
}

function toLspDiagnostic(d: Diagnostic): LspDiagnostic {
	const range = "line" in d ? toRange(d.line, d.column) : toRange(1, 1);
	const advisory = !(on(d, "score") || on(d, "ciFailure"));
	return {
		range,
		severity: advisory ? DiagnosticSeverity.Hint : severityMap[d.severity],
		code: d.rule,
		source: "nestjs-doctor",
		message: d.message,
		data: { advisory, category: d.category, help: d.help },
	};
}

export function groupByFile(
	diagnostics: Diagnostic[],
	workspaceRoot: string
): Map<string, LspDiagnostic[]> {
	const grouped = new Map<string, LspDiagnostic[]>();

	for (const d of diagnostics) {
		// A leading slash is not what absolute looks like on Windows, where a
		// scanned path arrives drive-prefixed as D:/proj/src/a.ts.
		const absolutePath = isAbsolute(d.filePath)
			? d.filePath
			: resolve(workspaceRoot, d.filePath);
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
