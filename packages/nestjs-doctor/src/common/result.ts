import type { Category, Diagnostic } from "./diagnostic.js";
import type { EndpointGraph } from "./endpoint.js";
import type { SerializedSchemaGraph } from "./schema.js";
import type { ScopeInfo } from "./scope.js";

export interface Score {
	label: string;
	value: number;
}

export interface ProjectInfo {
	fileCount: number;
	framework: "express" | "fastify" | null;
	moduleCount: number;
	name: string;
	nestVersion: string | null;
	orm: string | null;
}

export interface DiagnoseSummary {
	byCategory: Record<Category, number>;
	errors: number;
	info: number;
	total: number;
	warnings: number;
}

export interface RuleErrorInfo {
	error: string;
	ruleId: string;
}

export interface DiagnoseResult {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	endpoints?: EndpointGraph;
	project: ProjectInfo;
	ruleErrors: RuleErrorInfo[];
	schema?: SerializedSchemaGraph;
	/**
	 * `score` always reflects the whole project — health is a property of the
	 * codebase, not of how much of it a given run chose to report. `diagnostics`
	 * and `summary` reflect the scope described here.
	 *
	 * Absent when the run reported everything.
	 */
	scope?: ScopeInfo;
	score: Score;
	summary: DiagnoseSummary;
}

export interface SubProjectResult {
	name: string;
	result: DiagnoseResult;
}

export interface MonorepoResult {
	combined: DiagnoseResult;
	elapsedMs: number;
	isMonorepo: boolean;
	subProjects: SubProjectResult[];
}
