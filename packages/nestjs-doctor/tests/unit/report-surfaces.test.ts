import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { prepareReportData } from "../../src/report/formatters/report-data.js";

const emptyGraph = (): ModuleGraph => ({
	edges: new Map(),
	modules: new Map(),
	providerToModule: new Map(),
});

const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
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

const resultWith = (diagnostics: Diagnostic[]): DiagnoseResult =>
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
		elapsedMs: 10,
	}) as DiagnoseResult;

describe("html report surfaces", () => {
	it("keeps a report-only finding, which the not-scored toggle reveals", () => {
		const data = prepareReportData(
			emptyGraph(),
			resultWith([
				code({
					rule: "correctness/no-async-without-await",
					category: "correctness",
					message: "Async method has no await expression.",
					surfaces: ["cli"],
				}),
			])
		);

		const shown = JSON.parse(data.diagnosticsJson) as Diagnostic[];
		expect(shown).toHaveLength(1);
		expect(shown[0].surfaces).toEqual(["cli"]);
	});

	it("drops a finding the cli surface never shows", () => {
		const data = prepareReportData(
			emptyGraph(),
			resultWith([
				code({ rule: "correctness/hidden", surfaces: ["score"] }),
				code({}),
			])
		);

		const shown = JSON.parse(data.diagnosticsJson) as Diagnostic[];
		expect(shown.map((d) => d.rule)).toEqual([
			"performance/no-unused-providers",
		]);
	});

	it("keeps sourceLines aligned with the findings it kept", () => {
		const data = prepareReportData(
			emptyGraph(),
			resultWith([
				code({ rule: "correctness/hidden", surfaces: ["score"] }),
				code({}),
			])
		);

		const shown = JSON.parse(data.diagnosticsJson) as Diagnostic[];
		const sourceLines = JSON.parse(data.sourceLinesJson) as unknown[];
		expect(sourceLines).toHaveLength(shown.length);
	});
});
