import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import { calculateScore } from "../../src/engine/scorer/index.js";

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
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
	it("leaves the score untouched by report-only diagnostics", () => {
		const gating = makeDiagnostic({ severity: "error" });
		const reportOnly = makeDiagnostic({
			severity: "error",
			surfaces: ["cli"],
		});

		const alone = calculateScore([gating], 10);
		const withNoise = calculateScore(
			[gating, ...Array.from({ length: 50 }, () => reportOnly)],
			10
		);

		expect(withNoise.value).toBe(alone.value);
	});

	it("counts a diagnostic that lists the score surface", () => {
		const scored = makeDiagnostic({
			severity: "error",
			surfaces: ["cli", "score"],
		});
		expect(calculateScore([scored], 10).value).toBeLessThan(100);
	});

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
		const errorDiags = [makeDiagnostic({ severity: "error" })];
		const warnDiags = [makeDiagnostic({ severity: "warning" })];

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
			makeDiagnostic({ severity: "error", category: "security" })
		);
		const score = calculateScore(manyDiags, 1);
		expect(score.value).toBe(0);
	});

	it("assigns correct labels", () => {
		expect(calculateScore([], 10).label).toBe("Excellent");
	});
});

describe("error ceiling", () => {
	it("caps a project with one error at 89 however many files it has", () => {
		const oneError = makeDiagnostic({ severity: "error" });

		expect(calculateScore([oneError], 5000).value).toBe(89);
		expect(calculateScore([oneError], 5000).label).toBe("Good");
	});

	it("leaves warnings alone: many files still dilute them to 100", () => {
		const warning = makeDiagnostic({ severity: "warning" });

		expect(calculateScore([warning], 5000).value).toBe(100);
	});

	it("does not lift a score the penalty already put below the ceiling", () => {
		const errors = Array.from({ length: 10 }, () =>
			makeDiagnostic({ severity: "error" })
		);

		expect(calculateScore(errors, 10).value).toBeLessThan(89);
	});

	it("ignores an error that is not on the score surface", () => {
		const reportOnly = makeDiagnostic({
			severity: "error",
			surfaces: ["cli"],
		});

		expect(calculateScore([reportOnly], 10).value).toBe(100);
	});
});
