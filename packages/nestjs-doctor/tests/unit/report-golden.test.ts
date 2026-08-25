import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import type {
	ModuleGraph,
	ModuleNode,
} from "../../src/engine/graph/module-graph.js";
import {
	buildReportModel,
	prepareReportData,
	toLegacyScriptData,
} from "../../src/report/formatters/report-data.js";
import { getReportScripts } from "../../src/report/ui/scripts.js";

// Update EXPECTED whenever an intentional change to the emitted report script is reviewed.
const EXPECTED =
	"64ed7093de56195be76f35292e6f8a627472b8a5cbd783f2dddc0ab3a2a392d6";

const node = (name: string, imports: string[]): ModuleNode =>
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

const graph = (): ModuleGraph => ({
	edges: new Map([["AppModule", new Set(["AuthModule"])]]),
	modules: new Map([
		["AppModule", node("AppModule", ["AuthModule"])],
		["AuthModule", node("AuthModule", [])],
	]),
	providerToModule: new Map(),
});

const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
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

const result = (): DiagnoseResult =>
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

describe("golden legacy report script", () => {
	const providers = [
		{
			dependencies: ["DepService"],
			filePath: "/repo/src/foo.service.ts",
			name: "FooService",
			publicMethodCount: 2,
			module: "AppModule",
		},
	];

	it("derives the legacy payload from the model byte-for-byte", () => {
		const viaModel = toLegacyScriptData(
			buildReportModel(graph(), result(), { providers })
		);
		expect(viaModel).toEqual(
			prepareReportData(graph(), result(), { providers })
		);
	});

	it("keeps the emitted script bytes stable", () => {
		const data = prepareReportData(graph(), result(), { providers });
		const scripts = getReportScripts(data);
		expect(createHash("sha256").update(scripts).digest("hex")).toBe(EXPECTED);
	});
});
