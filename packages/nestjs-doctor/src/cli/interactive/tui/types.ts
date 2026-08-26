import type { ReportArtifact } from "../../../common/artifact.js";
import type { Diagnostic } from "../../../common/diagnostic.js";
import type { DiagnoseResult } from "../../../common/result.js";

export interface SubProjectView {
	diagnostics: Diagnostic[];
	errors: number;
	fileCount: number;
	info: number;
	name: string;
	score: number;
	warnings: number;
}

export type Toast = {
	kind: "error" | "info" | "success";
	text: string;
} | null;

export type MenuAction =
	| "ci"
	| "handoff"
	| "markdown"
	| "quit"
	| "report"
	| "review"
	| "share";

/** Everything the post-scan UI needs, handed over by the pipeline. */
export interface InteractiveContext {
	buildReportHtml: () => string;
	/** The serialized module graph, for sharing the modules section. */
	moduleGraph: () => ReportArtifact["graph"];
	result: DiagnoseResult;
	subProjects?: SubProjectView[];
	targetPath: string;
	version: string;
}
