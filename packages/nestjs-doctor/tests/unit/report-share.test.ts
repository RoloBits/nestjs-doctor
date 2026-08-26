import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import {
	buildSharedReport,
	ENDPOINTS_SECTION,
	enumerateShareSections,
	parseShareSections,
	SCORE_SECTION,
	SHARED_REPORT_VERSION,
	writeSharedReportFile,
} from "../../src/report/share.js";

const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	category: "security",
	column: 1,
	filePath: "/repo/src/a.service.ts",
	help: "Do better.",
	line: 3,
	message: "Hardcoded secret.",
	rule: "security/hardcoded-secret",
	severity: "error",
	sourceLines: [
		{ line: 2, text: "const a = 1;" },
		{ line: 3, text: "b();" },
	],
	...overrides,
});

const schemaIssue = (category: "schema"): Diagnostic => ({
	category,
	entity: "User",
	filePath: "/repo/prisma/schema.prisma",
	help: "Add an index.",
	message: "Foreign key is unindexed.",
	rule: "schema/missing-index",
	severity: "warning",
});

function resultWith(diagnostics: Diagnostic[]): DiagnoseResult {
	const byCategory = {
		security: 0,
		performance: 0,
		correctness: 0,
		architecture: 0,
		schema: 0,
	};
	for (const diagnostic of diagnostics) {
		byCategory[diagnostic.category]++;
	}
	return {
		diagnostics,
		elapsedMs: 10,
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: null,
			framework: null,
			fileCount: 4,
			moduleCount: 1,
		},
		ruleErrors: [],
		score: { value: 55, label: "Needs work" },
		summary: {
			total: diagnostics.length,
			errors: byCategory.security,
			warnings: diagnostics.length - byCategory.security,
			info: 0,
			byCategory,
		},
	};
}

describe("enumerateShareSections", () => {
	it("always offers the score and only categories that have findings", () => {
		const sections = enumerateShareSections(
			resultWith([code({}), schemaIssue("schema")])
		);

		expect(sections.map((section) => section.id)).toEqual([
			SCORE_SECTION,
			"findings:security",
			"findings:schema",
		]);
		expect(sections.map((section) => section.count)).toEqual([55, 1, 1]);
	});

	it("offers endpoints only when the result has them", () => {
		const bare = enumerateShareSections(resultWith([]));
		expect(bare).toHaveLength(1);

		const withEndpoints = resultWith([]);
		withEndpoints.endpoints = {
			endpoints: [
				{
					controllerClass: "CatsController",
					dependencies: [],
					endLine: 9,
					filePath: "/repo/src/cats.controller.ts",
					handlerMethod: "findMany",
					httpMethod: "GET",
					line: 7,
					returnType: null,
					routePath: "/cats",
					swagger: null,
				},
			],
		};
		expect(enumerateShareSections(withEndpoints)).toEqual([
			{
				id: SCORE_SECTION,
				count: 55,
				label: "Health score and project info",
			},
			{
				id: ENDPOINTS_SECTION,
				count: 1,
				label: "HTTP endpoints",
			},
		]);
	});
});

describe("buildSharedReport", () => {
	it("narrows to the picked categories and keeps the whole-project score", () => {
		const shared = buildSharedReport(
			resultWith([
				code({ category: "performance", rule: "perf/x" }),
				code({}),
				schemaIssue("schema"),
			]),
			{ includeCode: false, sections: [SCORE_SECTION, "findings:security"] },
			"1.2.3"
		);

		expect(shared?.score).toEqual({ value: 55, label: "Needs work" });
		expect(shared?.findings).toHaveLength(1);
		expect(shared?.findings[0].rule).toBe("security/hardcoded-secret");
		expect(shared?.schemaIssues).toEqual([]);
		expect(shared?.version).toBe(SHARED_REPORT_VERSION);
		expect(shared?.generator).toEqual({
			name: "nestjs-doctor",
			version: "1.2.3",
		});
		expect(shared?.summary.total).toBe(1);
	});

	it("strips snippets unless includeCode is set", () => {
		const result = resultWith([code({})]);

		const withoutCode = buildSharedReport(
			result,
			{
				includeCode: false,
				sections: ["findings:security"],
			},
			"1.2.3"
		);
		expect(JSON.stringify(withoutCode)).not.toContain("sourceLines");
		expect(withoutCode?.includeCode).toBe(false);

		const withCode = buildSharedReport(
			result,
			{
				includeCode: true,
				sections: ["findings:security"],
			},
			"1.2.3"
		);
		expect(withCode?.findings[0].sourceLines).toHaveLength(2);
		expect(withCode?.includeCode).toBe(true);
	});

	it("slims shared endpoints to their route facts", () => {
		const result = resultWith([]);
		result.endpoints = {
			endpoints: [
				{
					controllerClass: "CatsController",
					dependencies: [],
					endLine: 9,
					filePath: "/repo/src/cats.controller.ts",
					handlerMethod: "findMany",
					httpMethod: "GET",
					line: 7,
					returnType: null,
					routePath: "/cats",
					swagger: null,
				},
			],
		};

		const shared = buildSharedReport(
			result,
			{ includeCode: false, sections: [ENDPOINTS_SECTION] },
			"1.2.3"
		);

		expect(shared?.endpoints).toEqual([
			{
				controllerClass: "CatsController",
				handlerMethod: "findMany",
				httpMethod: "GET",
				routePath: "/cats",
			},
		]);
		const serialized = JSON.stringify(shared);
		expect(serialized).not.toContain("dependencies");
		expect(serialized).not.toContain("/repo/src/cats.controller.ts");
	});

	it("returns null when nothing was selected or nothing matched", () => {
		expect(
			buildSharedReport(
				resultWith([]),
				{ includeCode: false, sections: [] },
				"1.2.3"
			)
		).toBeNull();
		expect(
			buildSharedReport(
				resultWith([]),
				{ includeCode: true, sections: [ENDPOINTS_SECTION] },
				"1.2.3"
			)
		).toBeNull();
	});
});

const INVALID_MESSAGE = /Invalid --share-sections/;
const CATEGORY_HINT = /findings:security/;
const EMPTY_LIST_MESSAGE = /no sections/;

describe("parseShareSections", () => {
	it("parses a csv and tolerates spaces", () => {
		expect(parseShareSections(" score, findings:security,endpoints")).toEqual({
			sections: [SCORE_SECTION, "findings:security", ENDPOINTS_SECTION],
		});
	});

	it("rejects unknown sections and empty lists", () => {
		expect(parseShareSections("nope").error).toMatch(INVALID_MESSAGE);
		expect(parseShareSections("findings:nope").error).toMatch(CATEGORY_HINT);
		expect(parseShareSections(" , ").error).toMatch(EMPTY_LIST_MESSAGE);
	});
});

describe("writeSharedReportFile", () => {
	it("writes beside the scanned project when no path is named", async () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-share-"));
		const outPath = await writeSharedReportFile(
			dir,
			buildSharedReport(
				resultWith([code({})]),
				{ includeCode: false, sections: [SCORE_SECTION] },
				"1.2.3"
			) as NonNullable<ReturnType<typeof buildSharedReport>>
		);

		expect(outPath).toBe(join(dir, "nestjs-doctor-shared.json"));
		const parsed = JSON.parse(readFileSync(outPath, "utf-8")) as {
			score: unknown;
		};
		expect(parsed.score).toEqual({ value: 55, label: "Needs work" });
	});
});
