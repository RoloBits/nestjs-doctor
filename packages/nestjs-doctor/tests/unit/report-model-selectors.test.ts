import { describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type {
	SerializedModuleGraph,
	SerializedModuleNode,
} from "../../src/report/formatters/module-serializer.js";
import {
	buildCircularIndex,
	buildRootModules,
	collectUnusedProviders,
	isMonorepoPayload,
} from "../../src/report/model/selectors.js";

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

const node = (name: string): SerializedModuleNode => ({
	name,
	filePath: `/repo/src/${name}.ts`,
	imports: [],
	exports: [],
	providers: [],
	providerTokens: [],
	controllers: [],
	isGlobal: false,
});

const graphWith = (
	modules: SerializedModuleNode[],
	edges: Array<{ from: string; to: string }>,
	bootstrapRoots: string[] = []
): SerializedModuleGraph => ({
	bootstrapRoots,
	circularDepRecommendations: {},
	circularDeps: [],
	edges,
	modules,
	projects: [],
});

describe("isMonorepoPayload", () => {
	it("is true only for an empty map", () => {
		expect(isMonorepoPayload({})).toBe(true);
		expect(isMonorepoPayload({ "/a.ts": "x" })).toBe(false);
	});
});

describe("collectUnusedProviders", () => {
	it("extracts provider names from no-unused-providers findings", () => {
		const names = collectUnusedProviders([
			code({
				message: "Provider 'FooService' is never injected and not activated.",
			}),
			code({
				message: "Provider 'BarService' is never injected and not activated.",
			}),
			code({
				rule: "architecture/no-orphan-module",
				message: "Provider 'BazService' is never injected.",
			}),
			code({
				message: "No quoted name here.",
			}),
		]);
		expect(names).toEqual(new Set(["FooService", "BarService"]));
	});

	it("dedupes repeated findings for the same provider", () => {
		const names = collectUnusedProviders([
			code({ message: "Provider 'FooService' never used." }),
			code({ message: "Provider 'FooService' never used." }),
		]);
		expect(names).toEqual(new Set(["FooService"]));
	});
});

describe("buildCircularIndex", () => {
	it("indexes every module and wrapped edge of each cycle", () => {
		const index = buildCircularIndex([["A", "B", "C"]]);
		expect(index.modules).toEqual(new Set(["A", "B", "C"]));
		expect(index.edges).toEqual(new Set(["A->B", "B->C", "C->A"]));
	});

	it("returns empty sets for no cycles", () => {
		const index = buildCircularIndex([]);
		expect(index.modules.size).toBe(0);
		expect(index.edges.size).toBe(0);
	});
});

describe("buildRootModules", () => {
	it("collects unimported modules, AppModule, and bootstrap roots", () => {
		const graph = graphWith(
			[node("A"), node("B"), node("C"), node("R")],
			[{ from: "A", to: "B" }],
			["R"]
		);
		expect(buildRootModules(graph)).toEqual(new Set(["A", "C", "R"]));
	});

	it("keeps AppModule a root even when something imports it", () => {
		const graph = graphWith(
			[node("A"), node("AppModule")],
			[{ from: "A", to: "AppModule" }]
		);
		expect(buildRootModules(graph)).toEqual(new Set(["A", "AppModule"]));
	});
});
