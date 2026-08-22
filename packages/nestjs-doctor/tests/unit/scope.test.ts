import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import { isScopeMode, SCOPE_MODES } from "../../src/common/scope.js";
import type { GitRepo } from "../../src/engine/git.js";
import {
	applyScope,
	buildScopeInfo,
	type ResolvedScope,
	resolveScope,
} from "../../src/engine/scope.js";

const repo: GitRepo = { prefix: "", root: "/repo", targetPath: "/repo" };

const code = (filePath: string, line: number): CodeDiagnostic => ({
	rule: "performance/no-sync-io",
	category: "performance",
	severity: "warning",
	filePath,
	message: "Synchronous I/O.",
	help: "Use the async variant.",
	column: 1,
	line,
});

const schemaDiagnostic = (filePath: string): SchemaDiagnostic => ({
	rule: "schema/require-primary-key",
	category: "schema",
	severity: "error",
	filePath,
	message: "No primary key.",
	help: "Add one.",
	entity: "User",
});

const scoped = (overrides: Partial<ResolvedScope>): ResolvedScope => ({
	baseRef: "origin/main",
	files: null,
	lineRanges: null,
	mode: "full",
	repo,
	requestedMode: "full",
	warnings: [],
	...overrides,
});

describe("scope modes", () => {
	it("exposes the four documented modes", () => {
		expect(SCOPE_MODES).toEqual(["full", "files", "lines", "changed"]);
	});

	it("recognises valid modes only", () => {
		expect(isScopeMode("changed")).toBe(true);
		expect(isScopeMode("diff")).toBe(false);
	});
});

describe("applyScope", () => {
	const a = code("/repo/src/a.ts", 5);
	const b = code("/repo/src/b.ts", 5);
	const schemaFinding = schemaDiagnostic("/repo/src/a.ts");
	const all: Diagnostic[] = [a, b, schemaFinding];

	it("returns everything in full mode", () => {
		expect(applyScope(all, scoped({ mode: "full" }))).toBe(all);
	});

	it("keeps only findings in the changed files", () => {
		const result = applyScope(
			all,
			scoped({ mode: "files", files: new Set(["/repo/src/a.ts"]) })
		);
		expect(result).toEqual([a, schemaFinding]);
	});

	it("keeps only findings inside a changed hunk in lines mode", () => {
		const result = applyScope(
			[code("/repo/src/a.ts", 3), a, code("/repo/src/a.ts", 20)],
			scoped({
				mode: "lines",
				files: new Set(["/repo/src/a.ts"]),
				lineRanges: new Map([["/repo/src/a.ts", [{ start: 4, end: 6 }]]]),
			})
		);
		expect(result).toEqual([a]);
	});

	it("drops schema findings in lines mode, since they carry no line", () => {
		const result = applyScope(
			[schemaFinding],
			scoped({
				mode: "lines",
				files: new Set(["/repo/src/a.ts"]),
				lineRanges: new Map([["/repo/src/a.ts", [{ start: 1, end: 100 }]]]),
			})
		);
		expect(result).toEqual([]);
	});

	it("falls back to file granularity when line ranges are unavailable", () => {
		// Reporting a whole changed file beats reporting nothing at all.
		const result = applyScope(
			all,
			scoped({
				mode: "lines",
				files: new Set(["/repo/src/b.ts"]),
				lineRanges: null,
			})
		);
		expect(result).toEqual([b]);
	});

	it("normalises Windows separators before matching", () => {
		const windowsDiagnostic = code("C:\\repo\\src\\a.ts", 1);
		const result = applyScope(
			[windowsDiagnostic],
			scoped({ mode: "files", files: new Set(["C:/repo/src/a.ts"]) })
		);
		expect(result).toEqual([windowsDiagnostic]);
	});
});

describe("buildScopeInfo", () => {
	it("is absent when nothing was narrowed", () => {
		expect(buildScopeInfo(scoped({}))).toBeUndefined();
	});

	it("records the mode, base, and changed-file count", () => {
		expect(
			buildScopeInfo(
				scoped({
					mode: "files",
					requestedMode: "files",
					files: new Set(["/repo/a.ts", "/repo/b.ts"]),
				})
			)
		).toEqual({ mode: "files", baseRef: "origin/main", changedFiles: 2 });
	});

	it("records the mode it fell back from", () => {
		const info = buildScopeInfo(
			scoped({ mode: "files", requestedMode: "changed", files: new Set() })
		);
		expect(info?.degradedFrom).toBe("changed");
	});

	it("carries the baseline outcome through", () => {
		const info = buildScopeInfo(
			scoped({ mode: "changed", requestedMode: "changed", files: new Set() }),
			{ baselineAvailable: true, fixed: 4 }
		);
		expect(info).toMatchObject({ baselineAvailable: true, fixed: 4 });
	});
});

describe("resolveScope", () => {
	it("short-circuits in full mode without touching git", () => {
		const result = resolveScope({ mode: "full", targetPath: "/nowhere" });
		expect(result.mode).toBe("full");
		expect(result.files).toBeNull();
		expect(result.warnings).toEqual([]);
	});

	it("degrades to full with a warning outside a repository", () => {
		const result = resolveScope({
			mode: "files",
			targetPath: "/definitely/not/a/repo",
		});
		expect(result.mode).toBe("full");
		expect(result.requestedMode).toBe("files");
		expect(result.warnings.join(" ")).toContain("git repository");
	});
});

describe("findings above the scanned directory", () => {
	const rootManifest = {
		filePath: "/repo/package.json",
		rule: "security/no-advisory-nestjs-packages",
		severity: "warning" as const,
		message: "affected",
		help: "upgrade",
		line: 3,
		column: 1,
		category: "security" as const,
	};
	const inTree = {
		...rootManifest,
		filePath: "/repo/apps/api/src/a.ts",
		line: 9,
	};
	const repo = {
		prefix: "apps/api",
		root: "/repo",
		targetPath: "/repo/apps/api",
	};

	it("keeps a finding the changed-file set cannot speak to", () => {
		const kept = applyScope([rootManifest, inTree], {
			baseRef: "main",
			files: new Set(["/repo/apps/api/src/a.ts"]),
			lineRanges: null,
			mode: "files",
			repo,
			requestedMode: "files",
			warnings: [],
		});

		expect(kept).toHaveLength(2);
	});

	it("keeps it under lines scope too, where no hunk can contain it", () => {
		const kept = applyScope([rootManifest, inTree], {
			baseRef: "main",
			files: new Set(["/repo/apps/api/src/a.ts"]),
			lineRanges: new Map([
				["/repo/apps/api/src/a.ts", [{ start: 1, end: 20 }]],
			]),
			mode: "lines",
			repo,
			requestedMode: "lines",
			warnings: [],
		});

		expect(kept.map((d) => d.filePath)).toContain("/repo/package.json");
	});

	it("still drops an unchanged file inside the scanned tree", () => {
		const other = { ...inTree, filePath: "/repo/apps/api/src/b.ts" };
		const kept = applyScope([other], {
			baseRef: "main",
			files: new Set(["/repo/apps/api/src/a.ts"]),
			lineRanges: null,
			mode: "files",
			repo,
			requestedMode: "files",
			warnings: [],
		});

		expect(kept).toEqual([]);
	});
});
