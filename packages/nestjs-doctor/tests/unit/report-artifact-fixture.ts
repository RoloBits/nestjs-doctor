import type {
	ReportArtifact,
	ReportProvider,
} from "../../src/common/artifact.js";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";

export const resultWith = (diagnostics: Diagnostic[]): DiagnoseResult =>
	({
		score: { value: 90, label: "Excellent" },
		diagnostics,
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: "prisma",
			framework: "express",
			fileCount: 4,
			moduleCount: 1,
		},
		summary: {
			total: diagnostics.length,
			errors: 0,
			warnings: diagnostics.length,
			info: 0,
			byCategory: {
				security: 0,
				performance: diagnostics.length,
				correctness: 0,
				architecture: 0,
				schema: 0,
			},
		},
		ruleErrors: [],
		endpoints: undefined,
		schema: undefined,
		scope: undefined,
		elapsedMs: 10,
	}) as DiagnoseResult;

export const emptyResult = (): DiagnoseResult => resultWith([]);

export const codeDiagnostic = (
	overrides: Partial<CodeDiagnostic>
): CodeDiagnostic => ({
	rule: "performance/no-unused-providers",
	category: "performance",
	severity: "warning",
	filePath: "/repo/src/a.service.ts",
	message: "Provider is never injected.",
	help: "Remove it.",
	line: 3,
	column: 1,
	...overrides,
});

export const EMPTY_ARTIFACT: ReportArtifact = {
	schemaVersion: 1,
	generator: { name: "nestjs-doctor", version: "0.0.0" },
	generatedAt: "2026-01-01T00:00:00.000Z",
	monorepo: false,
	project: {
		name: "app",
		nestVersion: null,
		orm: null,
		framework: null,
		fileCount: 1,
		moduleCount: 1,
	},
	score: { value: 100, label: "Excellent" },
	summary: {
		total: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		byCategory: {
			security: 0,
			performance: 0,
			correctness: 0,
			architecture: 0,
			schema: 0,
		},
	},
	diagnostics: [] as Diagnostic[],
	ruleErrors: [],
	elapsedMs: 0,
	graph: {
		modules: [],
		edges: [],
		circularDeps: [],
		circularDepRecommendations: {},
		projects: [],
		bootstrapRoots: [],
		timingsTrace: {},
	},
	providers: [] as ReportProvider[],
	endpoints: { endpoints: [] },
	schema: { entities: [], relations: [], orm: "" },
	examples: {},
	sources: {},
};

export const EMPTY_ARTIFACT_JSON = JSON.stringify(EMPTY_ARTIFACT);
