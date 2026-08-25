import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import type {
	ModuleGraph,
	ModuleNode,
} from "../../src/engine/graph/module-graph.js";

export const node = (name: string, imports: string[]): ModuleNode =>
	({
		name,
		filePath: `/repo/src/${name}.ts`,
		imports,
		exports: [],
		providers: ["FooService"],
		providerTokens: [],
		controllers: [],
		isGlobal: false,
		forwardRefImports: new Set<string>(),
	}) as ModuleNode;

export const graph = (): ModuleGraph => ({
	edges: new Map([["AppModule", new Set(["AuthModule"])]]),
	modules: new Map([
		["AppModule", node("AppModule", ["AuthModule"])],
		["AuthModule", node("AuthModule", [])],
	]),
	providerToModule: new Map(),
});

export const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	rule: "performance/no-unused-providers",
	category: "performance",
	severity: "warning",
	filePath: "/repo/src/a.service.ts",
	message: "Provider 'FooService' is never injected.",
	help: "Remove it.",
	line: 3,
	column: 1,
	...overrides,
});

export const result = (): DiagnoseResult =>
	({
		score: { value: 90, label: "Excellent" },
		diagnostics: [
			code({}),
			code({
				rule: "correctness/no-async-without-await",
				category: "correctness",
				surfaces: ["cli"],
				sourceLines: [{ line: 3, text: "export class FooService {}" }],
			}),
		],
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: "prisma",
			framework: "express",
			fileCount: 4,
			moduleCount: 2,
		},
		summary: {
			total: 2,
			errors: 0,
			warnings: 2,
			info: 0,
			byCategory: {
				security: 0,
				performance: 1,
				correctness: 1,
				architecture: 0,
				schema: 0,
			},
		},
		ruleErrors: [],
		elapsedMs: 10,
	}) as DiagnoseResult;

export const reportProviders = [
	{
		dependencies: ["DepService"],
		filePath: "/repo/src/foo.service.ts",
		name: "FooService",
		publicMethodCount: 2,
		module: "AppModule",
	},
];
