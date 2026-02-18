import { describe, expect, it } from "vitest";
import { calculateScore } from "../../src/scorer/index.js";
import type { Diagnostic } from "../../src/types/diagnostic.js";

function makeDiagnostic(
	overrides: Partial<Diagnostic> = {},
): Diagnostic {
	return {
		filePath: "test.ts",
		rule: "test/rule",
		severity: "warning",
		message: "Test",
		help: "Fix it",
		line: 1,
		column: 1,
		category: "correctness",
		...overrides,
	};
}

describe("scorer", () => {
	it("returns 100 for no diagnostics", () => {
		const score = calculateScore([], 10);
		expect(score.value).toBe(100);
		expect(score.label).toBe("Excellent");
	});

	it("returns 100 for zero files", () => {
		const score = calculateScore([], 0);
		expect(score.value).toBe(100);
	});

	it("penalizes errors more than warnings", () => {
		const errorDiags = [
			makeDiagnostic({ severity: "error" }),
		];
		const warnDiags = [
			makeDiagnostic({ severity: "warning" }),
		];

		const errorScore = calculateScore(errorDiags, 1);
		const warnScore = calculateScore(warnDiags, 1);

		expect(errorScore.value).toBeLessThan(warnScore.value);
	});

	it("penalizes security issues more than performance", () => {
		const secDiags = [
			makeDiagnostic({ category: "security", severity: "error" }),
		];
		const perfDiags = [
			makeDiagnostic({ category: "performance", severity: "error" }),
		];

		const secScore = calculateScore(secDiags, 1);
		const perfScore = calculateScore(perfDiags, 1);

		expect(secScore.value).toBeLessThan(perfScore.value);
	});

	it("normalizes by file count", () => {
		const diags = [makeDiagnostic()];
		const scoreSmall = calculateScore(diags, 1);
		const scoreLarge = calculateScore(diags, 100);

		expect(scoreLarge.value).toBeGreaterThan(scoreSmall.value);
	});

	it("never goes below 0", () => {
		const manyDiags = Array.from({ length: 50 }, () =>
			makeDiagnostic({ severity: "error", category: "security" }),
		);
		const score = calculateScore(manyDiags, 1);
		expect(score.value).toBe(0);
	});

	it("assigns correct labels", () => {
		expect(calculateScore([], 10).label).toBe("Excellent");
	});
});
