import type { Category, Diagnostic } from "./diagnostic.js";

export interface Score {
	value: number;
	label: string;
}

export interface ProjectInfo {
	name: string;
	nestVersion: string | null;
	orm: string | null;
	framework: "express" | "fastify" | null;
	moduleCount: number;
	fileCount: number;
}

export interface DiagnoseSummary {
	total: number;
	errors: number;
	warnings: number;
	info: number;
	byCategory: Record<Category, number>;
}

export interface DiagnoseResult {
	score: Score;
	diagnostics: Diagnostic[];
	project: ProjectInfo;
	summary: DiagnoseSummary;
}
