import { describe, expect, it } from "vitest";
import {
	BLOCKING_LEVELS,
	isBlockingLevel,
	resolveBlocking,
	shouldBlock,
	validateBlockingArg,
} from "../../src/cli/blocking.js";
import type { DiagnoseSummary } from "../../src/common/result.js";

const summary = (
	errors: number,
	warnings: number,
	info = 0
): DiagnoseSummary => ({
	total: errors + warnings + info,
	errors,
	warnings,
	info,
	byCategory: {
		security: 0,
		performance: 0,
		correctness: 0,
		architecture: 0,
		schema: 0,
	},
});

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
		expect(shouldBlock(summary(9, 9, 9), "none")).toBe(false);
	});

	it("blocks at level error only when errors are present", () => {
		expect(shouldBlock(summary(1, 0), "error")).toBe(true);
		expect(shouldBlock(summary(0, 5), "error")).toBe(false);
		expect(shouldBlock(summary(0, 0, 5), "error")).toBe(false);
	});

	it("blocks at level warning on errors or warnings, but not on info", () => {
		expect(shouldBlock(summary(0, 1), "warning")).toBe(true);
		expect(shouldBlock(summary(2, 0), "warning")).toBe(true);
		expect(shouldBlock(summary(0, 0, 3), "warning")).toBe(false);
	});

	it("passes a clean summary at every level", () => {
		for (const level of BLOCKING_LEVELS) {
			expect(shouldBlock(summary(0, 0), level)).toBe(false);
		}
	});
});
