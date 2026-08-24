import type { DiagnoseResult } from "../../../common/result.js";

export interface SubProjectView {
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
	| "review";

/** Everything the post-scan UI needs, handed over by the pipeline. */
export interface InteractiveContext {
	buildReportHtml: () => string;
	result: DiagnoseResult;
	subProjects?: SubProjectView[];
	targetPath: string;
	version: string;
}
