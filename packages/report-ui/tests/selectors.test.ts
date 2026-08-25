import { describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../src/model";
import {
	buildFileTree,
	groupByFile,
	isNotScored,
	rootModules,
	worstSeverity,
	worstSeverityNode,
} from "../src/selectors";

const diag = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	category: "performance",
	column: 1,
	filePath: "/repo/src/a.service.ts",
	help: "Fix it.",
	line: 1,
	message: "m",
	rule: "r",
	severity: "warning",
	...overrides,
});

describe("groupByFile", () => {
	it("groups by path and sorts each group by line", () => {
		const groups = groupByFile([
			diag({ filePath: "/b.ts", line: 9 }),
			diag({ filePath: "/a.ts", line: 2 }),
			diag({ filePath: "/a.ts", line: 7 }),
			diag({ filePath: "/a.ts", line: 4, severity: "error" }),
		]);
		expect(groups.map((g) => g.path)).toEqual(["/a.ts", "/b.ts"]);
		expect(
			groups[0].entries.map((e) => ("line" in e.d ? e.d.line : 0))
		).toEqual([2, 4, 7]);
		expect(groups[0].entries.map((e) => e.origIdx)).toEqual([1, 3, 2]);
	});
});

describe("buildFileTree", () => {
	const tree = buildFileTree(
		groupByFile([
			diag({ filePath: "src/users/user.service.ts" }),
			diag({ filePath: "src/app.module.ts" }),
		])
	);

	it("compresses single-child chains", () => {
		expect(Object.keys(tree.children)).toEqual(["src"]);
		expect(Object.keys(tree.children.src!.children)).toEqual(["users"]);
		expect(Object.keys(tree.children.src!.files)).toEqual(["app.module.ts"]);
		expect(Object.keys(tree.children.src!.children.users!.files)).toEqual([
			"user.service.ts",
		]);
	});

	it("computes worst severity up the tree", () => {
		expect(
			worstSeverity(tree.children.src!.files["app.module.ts"]!.entries)
		).toBe("warning");
		expect(worstSeverityNode(tree)).toBe("warning");
	});
});

describe("isNotScored", () => {
	it("flags diagnostics whose surfaces exclude score", () => {
		expect(isNotScored(diag({ surfaces: ["cli"] }))).toBe(true);
		expect(isNotScored(diag({ surfaces: ["cli", "score"] }))).toBe(false);
		expect(isNotScored(diag({}))).toBe(false);
	});
});

describe("rootModules", () => {
	it("collects unimported modules, AppModule and bootstrap roots", () => {
		const roots = rootModules({
			bootstrapRoots: ["R"],
			circularDepRecommendations: {},
			circularDeps: [],
			edges: [{ from: "A", to: "B" }],
			modules: [
				{
					controllers: [],
					exports: [],
					filePath: "",
					imports: [],
					name: "A",
					providers: [],
				},
				{
					controllers: [],
					exports: [],
					filePath: "",
					imports: [],
					name: "B",
					providers: [],
				},
				{
					controllers: [],
					exports: [],
					filePath: "",
					imports: [],
					name: "AppModule",
					providers: [],
				},
				{
					controllers: [],
					exports: [],
					filePath: "",
					imports: [],
					name: "R",
					providers: [],
				},
			],
			projects: [],
		});
		expect(roots).toEqual(new Set(["A", "AppModule", "R"]));
	});
});
