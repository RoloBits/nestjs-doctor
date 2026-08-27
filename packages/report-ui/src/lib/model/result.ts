import type { Category } from "./diagnostic";

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
