import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import { buildReportArtifact } from "../../src/report/artifact.js";
import {
	buildSharedReport,
	buildShareManifest,
	ENDPOINTS_SECTION,
	enumerateShareSections,
	MODULES_SECTION,
	mergeShareSlices,
	parseShareSections,
	SCHEMA_SECTION,
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
			MODULES_SECTION,
		]);
		expect(sections.map((section) => section.count)).toEqual([55, 1, 1, 1]);
	});

	it("offers endpoints only when the result has them", () => {
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
			{
				id: MODULES_SECTION,
				count: 1,
				label: "Module graph",
			},
		]);
	});

	it("offers schema and modules without touching any graph", () => {
		const result = resultWith([]);
		result.project.moduleCount = 0;
		result.schema = {
			entities: [
				{
					columns: [],
					filePath: "/repo/src/user.entity.ts",
					name: "User",
					relations: [],
					tableName: "users",
				},
			],
			orm: "prisma",
			relations: [],
		};

		const bare = enumerateShareSections(result);
		expect(bare.map((section) => section.id)).toEqual([
			SCORE_SECTION,
			SCHEMA_SECTION,
		]);

		result.project.moduleCount = 3;
		expect(enumerateShareSections(result).map((section) => section.id)).toEqual(
			[SCORE_SECTION, SCHEMA_SECTION, MODULES_SECTION]
		);
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
			"1.2.3",
			"/repo"
		);

		expect(shared?.score).toEqual({ value: 55, label: "Needs work" });
		expect(shared?.project).toEqual(resultWith([]).project);
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

	it("relativises finding paths against the scanned directory", () => {
		const shared = buildSharedReport(
			resultWith([code({ filePath: "/repo/src/deep/a.service.ts" })]),
			{ includeCode: false, sections: ["findings:security"] },
			"1.2.3",
			"/repo"
		);

		expect(shared?.findings[0].filePath).toBe("src/deep/a.service.ts");
	});

	it("drops score and project info when the score section is not picked", () => {
		const shared = buildSharedReport(
			resultWith([code({})]),
			{ includeCode: false, sections: ["findings:security"] },
			"1.2.3",
			"/repo"
		);

		expect(shared?.project).toBeUndefined();
		expect(shared?.score).toBeUndefined();
	});

	it("carries the scan scope so a narrowed share reads as narrowed", () => {
		const result = resultWith([code({})]);
		result.scope = { changedFiles: 1, mode: "changed" };

		const shared = buildSharedReport(
			result,
			{ includeCode: false, sections: ["findings:security"] },
			"1.2.3",
			"/repo"
		);

		expect(shared?.scope).toEqual(result.scope);
		expect(
			buildSharedReport(
				resultWith([]),
				{
					includeCode: false,
					sections: [SCORE_SECTION],
				},
				"1.2.3"
			)?.scope
		).toBeUndefined();
	});

	it("never shares diagnostics outside the cli surface", () => {
		const shared = buildSharedReport(
			resultWith([
				code({}),
				code({
					category: "correctness",
					rule: "correctness/pr-comment-only",
					filePath: "/repo/src/b.service.ts",
					surfaces: ["prComment"],
				}),
			]),
			{
				includeCode: false,
				sections: ["findings:security", "findings:correctness"],
			},
			"1.2.3",
			"/repo"
		);

		expect(shared?.findings).toHaveLength(1);
		expect(shared?.findings[0].filePath).not.toContain("b.service");
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

	it("shares the schema with relative entity paths", () => {
		const result = resultWith([]);
		result.schema = {
			entities: [
				{
					columns: [
						{
							isGenerated: false,
							isNullable: false,
							isPrimary: true,
							isUnique: false,
							name: "id",
							type: "uuid",
						},
					],
					filePath: "/repo/src/user.entity.ts",
					name: "User",
					relations: [],
					tableName: "users",
				},
			],
			orm: "prisma",
			relations: [],
		};

		const shared = buildSharedReport(
			result,
			{ includeCode: false, sections: [SCHEMA_SECTION] },
			"1.2.3",
			"/repo"
		);

		expect(shared?.schema?.entities[0].filePath).toBe("src/user.entity.ts");
		expect(shared?.schema?.orm).toBe("prisma");
		const serialized = JSON.stringify(shared);
		expect(serialized).not.toContain("/repo/src/user.entity.ts");
	});

	it("shares a slim module graph without timings", () => {
		const graph = {
			bootstrapRoots: ["AppModule"],
			circularDepRecommendations: {},
			circularDeps: [["A", "B"]],
			edges: [{ from: "AppModule", to: "CatsModule" }],
			modules: [
				{
					controllers: ["CatsController"],
					exports: [],
					filePath: "/repo/src/cats.module.ts",
					hookTimings: [{ hook: "onModuleInit", ms: 5 } as never],
					imports: ["AppModule"],
					name: "CatsModule",
					providers: [],
				},
			],
			projects: [],
			timingsTrace: { CatsModule: {} as never },
		};

		const shared = buildSharedReport(
			resultWith([]),
			{ includeCode: false, sections: [MODULES_SECTION] },
			"1.2.3",
			"/repo",
			graph
		);

		expect(shared?.modules?.modules[0].filePath).toBe("src/cats.module.ts");
		const serialized = JSON.stringify(shared);
		expect(serialized).not.toContain("hookTimings");
		expect(serialized).not.toContain("timingsTrace");
		expect(serialized).not.toContain("circularDepRecommendations");
	});

	it("omits the modules payload when no graph was handed over", () => {
		expect(
			buildSharedReport(
				resultWith([]),
				{ includeCode: false, sections: [MODULES_SECTION] },
				"1.2.3",
				"/repo"
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

describe("manifest parity", () => {
	const graph = {
		bootstrapRoots: ["AppModule"],
		circularDepRecommendations: {},
		circularDeps: [["A", "B"]] as string[][],
		edges: [{ from: "AppModule", to: "CatsModule" }],
		modules: [
			{
				controllers: [],
				exports: [],
				filePath: "/repo/src/cats.module.ts",
				imports: [],
				name: "CatsModule",
				providers: [],
			},
		],
		projects: [],
	};

	const sample = (): DiagnoseResult => {
		const result = resultWith([
			code({}),
			code({ category: "performance", rule: "perf/x" }),
			schemaIssue("schema"),
		]);
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
		result.schema = {
			entities: [
				{
					columns: [],
					filePath: "/repo/src/user.entity.ts",
					name: "User",
					relations: [],
					tableName: "users",
				},
			],
			orm: "prisma",
			relations: [],
		};
		return result;
	};

	const ALL_SECTIONS = [
		SCORE_SECTION,
		"findings:security",
		"findings:performance",
		"findings:schema",
		ENDPOINTS_SECTION,
		SCHEMA_SECTION,
		MODULES_SECTION,
	];

	it("merging the manifest equals building directly", () => {
		const result = sample();
		const manifest = buildShareManifest(result, {
			graph,
			targetPath: "/repo",
		});

		for (const includeCode of [false, true]) {
			const direct = buildSharedReport(
				result,
				{ includeCode, sections: ALL_SECTIONS },
				"1.2.3",
				"/repo",
				graph
			);
			const merged = mergeShareSlices(manifest, {
				generator: { name: "nestjs-doctor", version: "1.2.3" },
				includeCode,
				sections: ALL_SECTIONS,
			});
			const strip = (value: unknown) => {
				const parsed = JSON.parse(JSON.stringify(value)) as Record<
					string,
					unknown
				>;
				const { generatedAt, ...rest } = parsed;
				return rest;
			};
			expect(strip(merged)).toEqual(strip(direct));
		}
	});

	it("the artifact embeds the manifest the share flow consumes", () => {
		const result = sample();
		const moduleNode = {
			controllers: [],
			exports: [],
			filePath: "/repo/src/cats.module.ts",
			forwardRefImports: new Set<string>(),
			imports: [],
			isGlobal: false,
			name: "CatsModule",
			providers: [],
		};
		const moduleGraph = {
			edges: new Map([["AppModule", new Set(["CatsModule"])]]),
			modules: new Map([["CatsModule", moduleNode]]),
			providerToModule: new Map(),
		};
		const artifact = buildReportArtifact({
			moduleGraph,
			result,
			targetPath: "/repo",
			version: "1.2.3",
		});

		expect(artifact.share).toEqual(
			buildShareManifest(result, {
				graph: artifact.graph,
				targetPath: "/repo",
			})
		);
		expect(artifact.share.sections.map((section) => section.id)).toEqual(
			ALL_SECTIONS
		);
		expect(artifact.share.modules?.modules[0].filePath).toBe(
			"src/cats.module.ts"
		);
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

	it("honors a named output path", async () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-share-named-"));
		const outPath = await writeSharedReportFile(
			"/somme/other/place",
			buildSharedReport(
				resultWith([]),
				{ includeCode: false, sections: [SCORE_SECTION] },
				"1.2.3"
			) as NonNullable<ReturnType<typeof buildSharedReport>>,
			join(dir, "custom.json")
		);

		expect(outPath).toBe(join(dir, "custom.json"));
		expect(readFileSync(outPath, "utf-8")).toContain("nestjs-doctor");
	});
});
