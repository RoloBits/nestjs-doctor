import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../../../src/common/diagnostic.js";
import { NESTJS_ADVISORIES } from "../../../src/engine/advisories/data.js";
import {
	compareVersions,
	parseRange,
	rangeIsWhollyBelow,
	rangeReaches,
} from "../../../src/engine/advisories/version.js";
import {
	noAdvisoryNestjsPackages,
	noVulnerableNestjsPackages,
} from "../../../src/engine/rules/definitions/security/no-vulnerable-nestjs-packages.js";
import type { ProjectRuleContext } from "../../../src/engine/rules/types.js";

const GHSA_ID = /^GHSA-/;
const CVE_ID = /^CVE-\d{4}-\d+$/;
const roots: string[] = [];

/** A real manifest on disk, optionally with packages installed beside it. */
const project = (
	versions: Record<string, string>,
	installed: Record<string, string> = {}
) => {
	const root = mkdtempSync(join(tmpdir(), "nd-adv-"));
	roots.push(root);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ name: "p", dependencies: versions }, null, 2)
	);
	for (const [name, version] of Object.entries(installed)) {
		const dir = join(root, "node_modules", ...name.split("/"));
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
	}
	return root;
};

const runRule = (
	rule: typeof noVulnerableNestjsPackages,
	targetPath: string
) => {
	const reported: Partial<CodeDiagnostic>[] = [];
	rule.check({
		targetPath,
		report: (d) => reported.push(d),
	} as unknown as ProjectRuleContext);
	return reported;
};

const run = (
	versions: Record<string, string>,
	installed: Record<string, string> = {}
) => {
	const root = project(versions, installed);
	return [
		...runRule(noVulnerableNestjsPackages, root),
		...runRule(noAdvisoryNestjsPackages, root),
	];
};

afterAll(() => {
	for (const root of roots) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("compareVersions", () => {
	it.each([
		["1.0.0", "1.0.1", -1],
		["1.2.0", "1.10.0", -1],
		["2.0.0", "10.0.0", -1],
		["11.1.18", "11.1.18", 0],
		["11.1.19", "11.1.18", 1],
		["1.0.0+build", "1.0.0", 0],
	])("orders %s against %s", (a, b, expected) => {
		expect(compareVersions(a, b)).toBe(expected);
	});

	it("sorts a prerelease below its own release", () => {
		expect(compareVersions("11.0.0-next.1", "11.0.0")).toBe(-1);
	});

	it("orders two prereleases numerically, not as text", () => {
		expect(compareVersions("11.0.0-next.2", "11.0.0-next.10")).toBe(-1);
	});

	it("returns null for something that is not a version", () => {
		expect(compareVersions("workspace:*", "1.0.0")).toBeNull();
	});
});

describe("parseRange", () => {
	it.each([
		["11.1.18", "11.1.18", undefined],
		["^11.0.1", "11.0.1", "12.0.0"],
		["^0.2.0", "0.2.0", "0.3.0"],
		["^0.0.3", "0.0.3", "0.0.4"],
		["~11.0.15", "11.0.15", "11.1.0"],
		[">=10.0.0 <11.0.0", "10.0.0", "11.0.0"],
	])("reads %s as [%s, %s)", (spec, from, below) => {
		expect(parseRange(spec)).toEqual({ from, below });
	});

	it.each([
		"11.x",
		"*",
		"latest",
		"workspace:*",
		"10 || 11",
		"npm:fork@1.2.3",
	])("gives up on %s rather than guessing", (spec) => {
		expect(parseRange(spec)).toBeNull();
	});
});

describe("rangeIsWhollyBelow", () => {
	it("is false when the range admits the patched version", () => {
		// npm installs the highest a range allows, so ^11.0.1 gets 11.1.18.
		expect(rangeIsWhollyBelow("^11.0.1", "11.1.18")).toBe(false);
		expect(rangeIsWhollyBelow("^11.1.17", "11.1.18")).toBe(false);
		expect(rangeIsWhollyBelow("~11.0.15", "11.0.16")).toBe(false);
		expect(rangeIsWhollyBelow("^0.2.0", "0.2.1")).toBe(false);
	});

	it("is true when every version it admits is below the fix", () => {
		expect(rangeIsWhollyBelow("^10.0.0", "11.1.18")).toBe(true);
		expect(rangeIsWhollyBelow("10.4.15", "10.4.16")).toBe(true);
		expect(rangeIsWhollyBelow(">=10.0.0 <11.0.0", "11.1.18")).toBe(true);
	});

	it("is false for a range it cannot parse", () => {
		expect(rangeIsWhollyBelow("11.x", "11.1.18")).toBe(false);
	});
});

describe("rangeReaches", () => {
	it("keeps a 10.x range out of an advisory bounded at 11.0.0-next.1", () => {
		expect(rangeReaches("^10.0.0", "11.0.0-next.1")).toBe(false);
		expect(rangeReaches("^11.0.0", "11.0.0-next.1")).toBe(true);
	});
});

describe("the advisory rules", () => {
	it("says nothing about the official starter's dependencies", () => {
		expect(
			run({ "@nestjs/core": "^11.0.1", "@nestjs/common": "^11.0.17" })
		).toEqual([]);
	});

	it("reports what is installed, not what the range allows", () => {
		const [found] = run(
			{ "@nestjs/core": "^11.0.1" },
			{ "@nestjs/core": "11.1.17" }
		);
		expect(found.message).toContain("@nestjs/core@11.1.17");
		expect(found.message).toContain("CVE-2026-35515");
	});

	it("stays quiet when the installed version is patched", () => {
		expect(
			run({ "@nestjs/core": "^11.0.1" }, { "@nestjs/core": "11.2.1" })
		).toEqual([]);
	});

	it("reports a range that admits no patched version", () => {
		const [found] = run({ "@nestjs/core": "^10.0.0" });
		expect(found.message).toContain("a range with no patched version in it");
		expect(found.help).toContain("11.1.18");
	});

	it("leaves 10.x alone where the 10.x line has its own fix", () => {
		expect(run({ "@nestjs/common": "^10.0.0" })).toEqual([]);
	});

	it("reports the critical devtools escape when it is pinned", () => {
		const [found] = run({ "@nestjs/devtools-integration": "0.2.0" });
		expect(found.message).toContain("CVE-2025-54782");
		expect(found.message).toContain("critical");
	});

	it("anchors at the line the dependency is declared on", () => {
		const [found] = run({ "@nestjs/core": "^10.0.0" });
		expect(found.line).toBeGreaterThan(1);
	});

	it("reports a path that exists", () => {
		const [found] = run({ "@nestjs/core": "^10.0.0" });
		expect(found.filePath?.endsWith("/package.json")).toBe(true);
	});

	it("reads the manifest when it runs, so an edit cannot go stale", () => {
		const root = project({ "@nestjs/core": "^10.0.0" });
		expect(runRule(noAdvisoryNestjsPackages, root)).toHaveLength(1);

		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ dependencies: { "@nestjs/core": "^11.1.18" } }, null, 2)
		);
		expect(runRule(noAdvisoryNestjsPackages, root)).toEqual([]);
	});
});

describe("severity and surfaces", () => {
	it("keeps the critical rule on every surface so it can fail a build", () => {
		expect(noVulnerableNestjsPackages.meta.severity).toBe("error");
		expect(noVulnerableNestjsPackages.meta.surfaces).toBeUndefined();
	});

	it("keeps the advisory rule off the score", () => {
		expect(noAdvisoryNestjsPackages.meta.severity).toBe("warning");
		expect(noAdvisoryNestjsPackages.meta.surfaces).toEqual([
			"cli",
			"prComment",
		]);
	});

	it("routes each advisory to exactly one of the two rules", () => {
		const root = project({
			"@nestjs/devtools-integration": "0.2.0",
			"@nestjs/core": "^10.0.0",
		});
		expect(runRule(noVulnerableNestjsPackages, root)).toHaveLength(1);
		expect(runRule(noAdvisoryNestjsPackages, root)).toHaveLength(1);
	});
});

describe("the advisory table", () => {
	it("names a real advisory for every entry", () => {
		for (const advisory of NESTJS_ADVISORIES) {
			expect(advisory.ghsa).toMatch(GHSA_ID);
			expect(advisory.cve).toMatch(CVE_ID);
			expect(advisory.url).toContain(advisory.ghsa);
			expect(advisory.packageName.startsWith("@nestjs/")).toBe(true);
			expect(compareVersions(advisory.patched, "0.0.0")).toBe(1);
		}
	});

	it("carries the high-severity advisories the error rule needs", () => {
		const high = NESTJS_ADVISORIES.filter(
			(a) => a.severity === "critical" || a.severity === "high"
		);
		expect(high.length).toBeGreaterThanOrEqual(5);
	});
});

describe("a workspace whose sub-projects share one manifest", () => {
	it("reports the root manifest itself, not a path under each sub-project", () => {
		// The manifest lives at the root; the sub-project has none of its own.
		const root = mkdtempSync(join(tmpdir(), "nd-ws-"));
		roots.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ dependencies: { "@nestjs/core": "^10.0.0" } }, null, 2)
		);
		mkdirSync(join(root, "apps", "api"), { recursive: true });

		const [found] = runRule(
			noAdvisoryNestjsPackages,
			join(root, "apps", "api")
		);

		expect(found.filePath).toBe(join(root, "package.json").replace(/\\/g, "/"));
		expect(found.filePath).not.toContain("apps/api");
		expect(existsSync(found.filePath as string)).toBe(true);
	});
});

describe("how the finding names the version", () => {
	it("names the exact pin when the spec is one", () => {
		const [found] = run({ "@nestjs/devtools-integration": "0.2.0" });
		expect(found.message).toContain("@nestjs/devtools-integration@0.2.0");
	});

	it("names the installed version over the spec when both are known", () => {
		const [found] = run(
			{ "@nestjs/core": "^10.0.0" },
			{ "@nestjs/core": "10.4.1" }
		);
		expect(found.message).toContain("@nestjs/core@10.4.1");
		expect(found.message).not.toContain("range");
	});
});

describe("defects the second review found", () => {
	it("matches an exact prerelease pin against a prerelease bound", () => {
		// @nestjs/common's 11.x row starts at 11.0.0-next.1 and is fixed in 11.0.16.
		expect(rangeReaches("11.0.0-next.5", "11.0.0-next.1")).toBe(true);
		expect(rangeReaches("^10.0.0", "11.0.0-next.1")).toBe(false);
		expect(run({ "@nestjs/common": "11.0.0-next.5" })).toHaveLength(1);
	});

	it("rejects a range that stops at or below where it starts", () => {
		expect(parseRange(">=11.1.18 <10.0.0")).toBeNull();
		// Unparseable, so it is reported as unchecked rather than as affected.
		const found = run({ "@nestjs/core": ">=11.1.18 <10.0.0" });
		expect(found).toHaveLength(1);
		expect(found[0].message).toContain("Could not establish");
	});

	it("reads no node_modules above the repository root", () => {
		const outer = mkdtempSync(join(tmpdir(), "nd-outer-"));
		roots.push(outer);
		const stray = join(outer, "node_modules", "@nestjs", "core");
		mkdirSync(stray, { recursive: true });
		writeFileSync(
			join(stray, "package.json"),
			JSON.stringify({ name: "@nestjs/core", version: "11.1.5" })
		);
		const repo = join(outer, "repo");
		mkdirSync(join(repo, ".git"), { recursive: true });
		writeFileSync(
			join(repo, "package.json"),
			JSON.stringify({ dependencies: { "@nestjs/core": "^11.1.18" } }, null, 2)
		);

		expect(runRule(noAdvisoryNestjsPackages, repo)).toEqual([]);
	});

	it("reports the line inside the block the version came from", () => {
		const root = mkdtempSync(join(tmpdir(), "nd-blocks-"));
		roots.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify(
				{
					dependencies: { "@nestjs/core": "^10.0.0" },
					devDependencies: { "@nestjs/core": "^11.1.18" },
				},
				null,
				2
			)
		);
		const [found] = runRule(noAdvisoryNestjsPackages, root);

		// dependencies is what npm installs, so that is the line and the version.
		expect(found.message).toContain("^10.0.0");
		expect(found.line).toBe(3);
	});

	it("ignores a matching key under overrides", () => {
		const root = mkdtempSync(join(tmpdir(), "nd-ovr-"));
		roots.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify(
				{
					overrides: { "@nestjs/core": "9.0.0" },
					dependencies: { "@nestjs/core": "^10.0.0" },
				},
				null,
				2
			)
		);
		const [found] = runRule(noAdvisoryNestjsPackages, root);
		expect(found.line).toBe(6);
	});

	it("says so when it cannot establish a version rather than staying silent", () => {
		const [found] = run({ "@nestjs/core": "11.x" });
		expect(found.message).toContain(
			"Could not establish the installed version"
		);
		expect(found.message).toContain("@nestjs/core");
	});

	it("says nothing about a package it could check", () => {
		expect(
			run({ "@nestjs/core": "^11.1.18" }).filter((d) =>
				d.message?.includes("Could not establish")
			)
		).toEqual([]);
	});
});
