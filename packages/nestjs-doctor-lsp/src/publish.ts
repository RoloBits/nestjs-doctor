import type { Diagnostic as LspDiagnostic } from "vscode-languageserver/node";

export type SendDiagnostics = (
	uri: string,
	diagnostics: LspDiagnostic[]
) => void;

/** Compares what the editor renders, so an unchanged file is not republished. */
export function diagnosticsEqual(
	a: LspDiagnostic[],
	b: LspDiagnostic[]
): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const da = a[i];
		const db = b[i];
		if (
			da.code !== db.code ||
			da.message !== db.message ||
			da.severity !== db.severity ||
			da.range.start.line !== db.range.start.line ||
			da.range.start.character !== db.range.start.character
		) {
			return false;
		}
	}
	return true;
}

/**
 * Sends what changed and an empty list for every file that dropped out, which
 * is what clears a finding the user has just fixed. Returns the new cache.
 */
export function publishDiagnostics(
	previous: Map<string, LspDiagnostic[]>,
	next: Map<string, LspDiagnostic[]>,
	send: SendDiagnostics
): Map<string, LspDiagnostic[]> {
	for (const uri of previous.keys()) {
		if (!next.has(uri)) {
			send(uri, []);
		}
	}

	for (const [uri, diagnostics] of next) {
		const cached = previous.get(uri);
		if (cached && diagnosticsEqual(cached, diagnostics)) {
			continue;
		}
		send(uri, diagnostics);
	}

	return next;
}
