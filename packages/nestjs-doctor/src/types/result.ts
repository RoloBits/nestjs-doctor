import type { Category, Diagnostic } from "./diagnostic.js";

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

export interface DiagnoseResult {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	project: ProjectInfo;
	score: Score;
	summary: DiagnoseSummary;
}
