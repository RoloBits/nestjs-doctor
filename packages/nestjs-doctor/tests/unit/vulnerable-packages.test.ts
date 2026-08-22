import { describe, expect, it } from "vitest";

const GHSA_ID = /^GHSA-/;
const CVE_ID = /^CVE-\d{4}-\d+$/;

import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import { NESTJS_ADVISORIES } from "../../src/engine/advisories/data.js";
import {
	compareVersions,
	lowestAllowed,
} from "../../src/engine/advisories/version.js";
import {
	nestjsPackageAdvisory,
	noVulnerableNestjsPackages,
} from "../../src/engine/rules/definitions/security/no-vulnerable-nestjs-packages.js";
import type { ProjectRuleContext } from "../../src/engine/rules/types.js";

const runRule = (
	rule: typeof noVulnerableNestjsPackages,
	dependencies: Record<string, string>
) => {
	const reported: Partial<CodeDiagnostic>[] = [];
	rule.check({
		dependencies,
		targetPath: "/repo",
		report: (d) => reported.push(d),
	} as unknown as ProjectRuleContext);
	return reported;
};

/** Both rules together, which is what a scan reports. */
const run = (dependencies: Record<string, string>) => [
	...runRule(noVulnerableNestjsPackages, dependencies),
	...runRule(nestjsPackageAdvisory, dependencies),
];

describe("compareVersions", () => {
	it.each([
		["1.0.0", "1.0.1", -1],
		["1.2.0", "1.10.0", -1],
		["2.0.0", "10.0.0", -1],
		["11.1.18", "11.1.18", 0],
		["11.1.19", "11.1.18", 1],
	])("orders %s against %s", (a, b, expected) => {
		expect(compareVersions(a, b)).toBe(expected);
	});

	it("sorts a prerelease below its own release", () => {
		expect(compareVersions("11.0.0-next.1", "11.0.0")).toBe(-1);
		expect(compareVersions("11.0.0", "11.0.0-next.1")).toBe(1);
	});

	it("orders two prereleases numerically, not as text", () => {
		expect(compareVersions("11.0.0-next.2", "11.0.0-next.10")).toBe(-1);
	});

	it("returns null for something that is not a version", () => {
		expect(compareVersions("workspace:*", "1.0.0")).toBeNull();
	});
});

describe("lowestAllowed", () => {
	it.each([
		["^11.1.2", "11.1.2"],
		["~10.4.0", "10.4.0"],
		[">=9.0.0 <10", "9.0.0"],
		["11.0.0-next.1", "11.0.0-next.1"],
		["11.1.18", "11.1.18"],
	])("reads %s as %s", (range, expected) => {
		expect(lowestAllowed(range)).toBe(expected);
	});

	it("gives up on a range with no version in it", () => {
		expect(lowestAllowed("workspace:*")).toBeNull();
		expect(lowestAllowed("*")).toBeNull();
	});
});

describe("security/no-vulnerable-nestjs-packages", () => {
	it("reports the critical devtools sandbox escape", () => {
		const [found] = run({ "@nestjs/devtools-integration": "^0.2.0" });

		expect(found.message).toContain("CVE-2025-54782");
		expect(found.message).toContain("critical");
		expect(found.help).toContain("0.2.1");
		expect(found.filePath).toBe("/repo/package.json");
	});

	it("stays quiet once the package is patched", () => {
		expect(run({ "@nestjs/devtools-integration": "^0.2.1" })).toHaveLength(0);
	});

	it("reports an unpatched @nestjs/core", () => {
		const [found] = run({ "@nestjs/core": "11.1.17" });
		expect(found.message).toContain("CVE-2026-35515");
		expect(found.message).toContain("Patched in 11.1.18");
	});

	it("stays quiet on the patched @nestjs/core", () => {
		expect(run({ "@nestjs/core": "^11.1.18" })).toHaveLength(0);
	});

	it("honours the lower bound, so 10.x is not reported for the 11.x range", () => {
		// CVE-2024-29409 has two ranges: >=11.0.0-next.1 <11.0.16, and <10.4.16.
		const found = run({ "@nestjs/common": "10.4.16" });
		expect(found).toHaveLength(0);
	});

	it("reports the 10.x line below its own patched version", () => {
		const [found] = run({ "@nestjs/common": "10.4.15" });
		expect(found.message).toContain("CVE-2024-29409");
		expect(found.help).toContain("10.4.16");
	});

	it("reports the 11.x line below its own patched version", () => {
		const found = run({ "@nestjs/common": "11.0.15" });
		expect(found.map((f) => f.help)).toEqual([
			expect.stringContaining("11.0.16"),
		]);
	});

	it("says nothing about a package the project does not declare", () => {
		expect(run({ express: "^4.18.0" })).toHaveLength(0);
	});

	it("ignores a workspace protocol rather than guessing a version", () => {
		expect(run({ "@nestjs/core": "workspace:*" })).toHaveLength(0);
	});

	it("reads a caret range at its floor, which is what a fresh install gets", () => {
		expect(run({ "@nestjs/core": "^11.1.17" })).toHaveLength(1);
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
});

describe("severity is split across the two rules", () => {
	it("puts a critical advisory on the error rule", () => {
		const deps = { "@nestjs/devtools-integration": "^0.2.0" };
		expect(runRule(noVulnerableNestjsPackages, deps)).toHaveLength(1);
		expect(runRule(nestjsPackageAdvisory, deps)).toHaveLength(0);
	});

	it("puts a moderate advisory on the warning rule", () => {
		const deps = { "@nestjs/core": "^10.0.0" };
		expect(runRule(noVulnerableNestjsPackages, deps)).toHaveLength(0);
		expect(runRule(nestjsPackageAdvisory, deps)).toHaveLength(1);
	});

	it("keeps the error rule at error and the other at warning", () => {
		expect(noVulnerableNestjsPackages.meta.severity).toBe("error");
		expect(nestjsPackageAdvisory.meta.severity).toBe("warning");
	});
});
