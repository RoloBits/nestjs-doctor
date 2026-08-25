import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	REPORT_ARTIFACT_VERSION,
	type ReportArtifact,
} from "../../src/common/artifact.js";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildReportArtifact } from "../../src/report/artifact.js";

const emptyGraph = (): ModuleGraph => ({
	edges: new Map(),
	modules: new Map(),
	providerToModule: new Map(),
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
		endpoints: undefined,
		schema: undefined,
		scope: undefined,
		elapsedMs: 10,
	}) as DiagnoseResult;

const code = (filePath: string): CodeDiagnostic => ({
	rule: "performance/no-unused-providers",
	category: "performance",
	severity: "warning",
	filePath,
	message: "Provider is never injected.",
	help: "Remove it.",
	line: 3,
	column: 1,
});

const schema = (): SchemaDiagnostic => ({
	rule: "schema/missing-index",
	category: "schema",
	severity: "warning",
	filePath: "/repo/prisma/schema.prisma",
	entity: "User",
	message: "Foreign key is unindexed.",
	help: "Add an index.",
});

function writeTempSources(): { dir: string; a: string; b: string } {
	const dir = mkdtempSync(join(tmpdir(), "nd-artifact-"));
	const a = join(dir, "a.service.ts");
	const b = join(dir, "b.service.ts");
	writeFileSync(a, "export class A {}\n", "utf-8");
	writeFileSync(b, "export class B {}\n", "utf-8");
	return { dir, a, b };
}

describe("report artifact", () => {
	it("round-trips through JSON with both diagnostic kinds", () => {
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([code("/repo/src/a.service.ts"), schema()]),
			version: "1.2.3",
		});
		const parsed = JSON.parse(JSON.stringify(artifact)) as ReportArtifact;

		expect(parsed).toEqual(artifact);
		expect(parsed.schemaVersion).toBe(REPORT_ARTIFACT_VERSION);
		expect(parsed.generator).toEqual({
			name: "nestjs-doctor",
			version: "1.2.3",
		});
		expect(parsed.diagnostics.some((d) => "line" in d)).toBe(true);
		expect(parsed.diagnostics.some((d) => "entity" in d)).toBe(true);
		expect(parsed.score).toEqual({ value: 90, label: "Excellent" });
	});

	it("normalizes absent collections so consumers never branch on them", () => {
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([]),
			version: "1.2.3",
		});

		expect(artifact.endpoints).toEqual({ endpoints: [] });
		expect(artifact.graph.modules).toEqual([]);
		expect(artifact.graph.edges).toEqual([]);
		expect(artifact.graph.circularDeps).toEqual([]);
		expect(artifact.graph.projects).toEqual([]);
		expect(artifact.providers).toEqual([]);
		expect(artifact.monorepo).toBe(false);
		expect(artifact.generatedAt).toBeTruthy();
	});

	it("defaults an absent schema to an empty graph the UI can dereference", () => {
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([]),
			version: "1.2.3",
		});

		expect(artifact.schema).toEqual({ entities: [], relations: [], orm: "" });
	});

	it("embeds every scanned file's source by default", () => {
		const { a, b } = writeTempSources();
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([code(a)]),
			files: [a, b],
			version: "1.2.3",
		});

		expect(Object.keys(artifact.sources).sort()).toEqual([a, b].sort());
		expect(artifact.sources[a]).toContain("class A");
	});

	it("embeds only finding-referenced files with sources=touched", () => {
		const { a, b } = writeTempSources();
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([code(a)]),
			files: [a, b],
			sources: "touched",
			version: "1.2.3",
		});

		expect(Object.keys(artifact.sources)).toEqual([a]);
	});

	it("embeds nothing with sources=none", () => {
		const { a, b } = writeTempSources();
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result: resultWith([code(a)]),
			files: [a, b],
			sources: "none",
			version: "1.2.3",
		});

		expect(artifact.sources).toEqual({});
	});

	it("keeps scope metadata next to the narrowed findings", () => {
		const result = {
			...resultWith([]),
			scope: {
				mode: "files" as const,
				described: ["changed files under src/"],
				files: ["/repo/src/a.service.ts"],
			},
		};
		const artifact = buildReportArtifact({
			moduleGraph: emptyGraph(),
			result,
			version: "1.2.3",
		});

		expect(artifact.scope?.mode).toBe("files");
	});
});
