import { describe, expect, it } from "vitest";
import {
	checkMinScore,
	resolveMinScore,
	validateMinScoreArg,
} from "../../src/cli/min-score.js";

describe("validateMinScoreArg", () => {
	it("accepts valid integer 0", () => {
		expect(validateMinScoreArg("0")).toBeNull();
	});

	it("accepts valid integer 100", () => {
		expect(validateMinScoreArg("100")).toBeNull();
	});

	it("accepts valid integer 75", () => {
		expect(validateMinScoreArg("75")).toBeNull();
	});

	it("rejects non-numeric input", () => {
		expect(validateMinScoreArg("abc")).toContain("Invalid --min-score value");
	});

	it("rejects float values", () => {
		expect(validateMinScoreArg("75.5")).toContain("Invalid --min-score value");
	});

	it("rejects negative values", () => {
		expect(validateMinScoreArg("-1")).toContain("Invalid --min-score value");
	});

	it("rejects values above 100", () => {
		expect(validateMinScoreArg("101")).toContain("Invalid --min-score value");
	});

	it("rejects empty string", () => {
		expect(validateMinScoreArg("")).toContain("Invalid --min-score value");
	});
});

describe("resolveMinScore", () => {
	it("returns CLI value when provided", () => {
		expect(resolveMinScore("80", 60)).toBe(80);
	});

	it("returns config value when CLI is undefined", () => {
		expect(resolveMinScore(undefined, 60)).toBe(60);
	});

	it("returns undefined when both are undefined", () => {
		expect(resolveMinScore(undefined, undefined)).toBeUndefined();
	});

	it("CLI value overrides config value", () => {
		expect(resolveMinScore("90", 70)).toBe(90);
	});
});

describe("checkMinScore", () => {
	it("returns true when threshold is undefined", () => {
		expect(checkMinScore(50, undefined)).toBe(true);
	});

	it("returns true when score equals threshold", () => {
		expect(checkMinScore(75, 75)).toBe(true);
	});

	it("returns true when score is above threshold", () => {
		expect(checkMinScore(90, 75)).toBe(true);
	});

	it("returns false when score is below threshold", () => {
		expect(checkMinScore(60, 75)).toBe(false);
	});

	it("returns true for score 0 with threshold 0", () => {
		expect(checkMinScore(0, 0)).toBe(true);
	});

	it("returns true for score 100 with threshold 100", () => {
		expect(checkMinScore(100, 100)).toBe(true);
	});
});
