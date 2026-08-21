import { describe, expect, it } from "vitest";
import {
	BLOCKING_LEVELS,
	isBlockingLevel,
	resolveBlocking,
	shouldBlock,
	validateBlockingArg,
} from "../../src/cli/blocking.js";
import type {
	Diagnostic,
	DiagnosticSurface,
	Severity,
} from "../../src/common/diagnostic.js";

const at = (severity: Severity, surfaces?: DiagnosticSurface[]): Diagnostic =>
	({
		category: "correctness",
		column: 1,
		filePath: "a.ts",
		help: "",
		line: 1,
		message: "",
		rule: "correctness/example",
		severity,
		...(surfaces ? { surfaces } : {}),
	}) as Diagnostic;

/** Diagnostics with no surfaces declared, which is every rule by default. */
const found = (errors: number, warnings: number, info = 0): Diagnostic[] => [
	...Array.from({ length: errors }, () => at("error")),
	...Array.from({ length: warnings }, () => at("warning")),
	...Array.from({ length: info }, () => at("info")),
];

describe("blocking levels", () => {
	it("exposes exactly the three documented levels", () => {
		expect(BLOCKING_LEVELS).toEqual(["none", "warning", "error"]);
	});

	it("recognises valid levels and rejects anything else", () => {
		expect(isBlockingLevel("warning")).toBe(true);
		expect(isBlockingLevel("fatal")).toBe(false);
		expect(isBlockingLevel("")).toBe(false);
	});

	it("returns an actionable message for an invalid value", () => {
		expect(validateBlockingArg("error")).toBeNull();
		expect(validateBlockingArg("nope")).toContain("none, warning, error");
	});
});

describe("resolveBlocking", () => {
	it("defaults the console report to failing on errors", () => {
		expect(resolveBlocking(undefined, false)).toBe("error");
	});

	it("defaults machine-readable output to never failing on findings", () => {
		// Preserves the pre-`--blocking` behaviour: `--json` and `--score` only
		// ever failed on `--min-score`.
		expect(resolveBlocking(undefined, true)).toBe("none");
	});

	it("lets an explicit level override the per-mode default in both directions", () => {
		expect(resolveBlocking("none", false)).toBe("none");
		expect(resolveBlocking("error", true)).toBe("error");
		expect(resolveBlocking("warning", true)).toBe("warning");
	});

	it("falls back to the default when the explicit value is not a level", () => {
		expect(resolveBlocking("bogus", false)).toBe("error");
	});
});

describe("shouldBlock", () => {
	it("never blocks at level none", () => {
		expect(shouldBlock(found(9, 9, 9), "none")).toBe(false);
	});

	it("blocks at level error only when errors are present", () => {
		expect(shouldBlock(found(1, 0), "error")).toBe(true);
		expect(shouldBlock(found(0, 5), "error")).toBe(false);
		expect(shouldBlock(found(0, 0, 5), "error")).toBe(false);
	});

	it("blocks at level warning on errors or warnings, but not on info", () => {
		expect(shouldBlock(found(0, 1), "warning")).toBe(true);
		expect(shouldBlock(found(2, 0), "warning")).toBe(true);
		expect(shouldBlock(found(0, 0, 3), "warning")).toBe(false);
	});

	it("passes a clean run at every level", () => {
		for (const level of BLOCKING_LEVELS) {
			expect(shouldBlock(found(0, 0), level)).toBe(false);
		}
	});

	it("ignores diagnostics that are not on the ciFailure surface", () => {
		const reportOnly = [at("error", ["cli"]), at("warning", ["cli"])];
		expect(shouldBlock(reportOnly, "error")).toBe(false);
		expect(shouldBlock(reportOnly, "warning")).toBe(false);
	});

	it("still blocks when a gating diagnostic sits beside report-only ones", () => {
		const mixed = [at("error", ["cli"]), at("error")];
		expect(shouldBlock(mixed, "error")).toBe(true);
	});

	it("blocks on a rule that opted into ciFailure explicitly", () => {
		const explicit = [at("error", ["cli", "ciFailure"])];
		expect(shouldBlock(explicit, "error")).toBe(true);
	});
});
