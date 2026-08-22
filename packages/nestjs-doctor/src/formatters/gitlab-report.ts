import type { Diagnostic, Severity } from "../common/diagnostic.js";
import { forSurface, isCodeDiagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { fingerprint, toRelativePath } from "../engine/fingerprint.js";

/** GitLab accepts `info | minor | major | critical | blocker`. */
const SEVERITY_MAP: Record<Severity, string> = {
	error: "major",
	warning: "minor",
	info: "info",
};

export interface CodeQualityIssue {
	check_name: string;
	description: string;
	fingerprint: string;
	location: {
		lines: { begin: number };
		path: string;
	};
	severity: string;
}

/** Renders a result in the CodeClimate subset GitLab's Code Quality reads. */
export function buildCodeQualityReport(
	result: DiagnoseResult,
	targetPath: string
): CodeQualityIssue[] {
	return forSurface(result.diagnostics, "prComment").map(
		(diagnostic: Diagnostic) => ({
			description: `${diagnostic.message} ${diagnostic.help}`.trim(),
			check_name: diagnostic.rule,
			fingerprint: fingerprint(diagnostic, targetPath),
			severity: SEVERITY_MAP[diagnostic.severity],
			location: {
				path: toRelativePath(targetPath, diagnostic.filePath),
				lines: {
					begin: isCodeDiagnostic(diagnostic)
						? Math.max(1, diagnostic.line)
						: 1,
				},
			},
		})
	);
}
