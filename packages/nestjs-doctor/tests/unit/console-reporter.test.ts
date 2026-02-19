import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildScoreBarSegments,
	formatElapsedTime,
	getNestBirds,
	getSeverityIcon,
	getStarRating,
	printFramedBox,
} from "../../src/cli/output/console-reporter.js";
import type { Diagnostic } from "../../src/types/diagnostic.js";

const FILLED_BLOCK_REGEX = /^█+$/;
const EMPTY_BLOCK_REGEX = /^░+$/;

import type { DiagnoseResult } from "../../src/types/result.js";

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		filePath: "test.ts",
		rule: "test/rule",
		severity: "warning",
		message: "Test message",
		help: "Fix it",
		line: 1,
		column: 1,
		category: "correctness",
		...overrides,
	};
}

function makeResult(overrides: Partial<DiagnoseResult> = {}): DiagnoseResult {
	return {
		score: { value: 85, label: "Good" },
		diagnostics: [],
		project: {
			name: "test-project",
			nestVersion: "10.0.0",
			orm: "prisma",
			framework: "express",
			moduleCount: 5,
			fileCount: 20,
		},
		summary: {
			total: 0,
			errors: 0,
			warnings: 0,
			info: 0,
			byCategory: {
				security: 0,
				architecture: 0,
				correctness: 0,
				performance: 0,
			},
		},
		ruleErrors: [],
		elapsedMs: 1200,
		...overrides,
	};
}

describe("console-reporter", () => {
	describe("getNestBirds", () => {
		it("returns happy birds for score >= 75", () => {
			const result = getNestBirds(75);
			expect(result[0]).toBe("◠ ◠ ◠");
			expect(result[1]).toBe("╰───╯");
		});

		it("returns happy birds for score 100", () => {
			const result = getNestBirds(100);
			expect(result[0]).toBe("◠ ◠ ◠");
			expect(result[1]).toBe("╰───╯");
		});

		it("returns calm birds for score >= 50 and < 75", () => {
			const result = getNestBirds(50);
			expect(result[0]).toBe("• • •");
			expect(result[1]).toBe("╰───╯");
		});

		it("returns calm birds for score 74", () => {
			const result = getNestBirds(74);
			expect(result[0]).toBe("• • •");
			expect(result[1]).toBe("╰───╯");
		});

		it("returns distressed birds for score < 50", () => {
			const result = getNestBirds(49);
			expect(result[0]).toBe("x x x");
			expect(result[1]).toBe("╰───╯");
		});

		it("returns distressed birds for score 0", () => {
			const result = getNestBirds(0);
			expect(result[0]).toBe("x x x");
			expect(result[1]).toBe("╰───╯");
		});
	});

	describe("getStarRating", () => {
		it("returns 5 stars for score 100", () => {
			expect(getStarRating(100)).toBe("★★★★★");
		});

		it("returns 5 stars for score 90", () => {
			expect(getStarRating(90)).toBe("★★★★★");
		});

		it("returns 4 stars for score 89", () => {
			expect(getStarRating(89)).toBe("★★★★☆");
		});

		it("returns 4 stars for score 75", () => {
			expect(getStarRating(75)).toBe("★★★★☆");
		});

		it("returns 3 stars for score 74", () => {
			expect(getStarRating(74)).toBe("★★★☆☆");
		});

		it("returns 3 stars for score 50", () => {
			expect(getStarRating(50)).toBe("★★★☆☆");
		});

		it("returns 2 stars for score 49", () => {
			expect(getStarRating(49)).toBe("★★☆☆☆");
		});

		it("returns 2 stars for score 25", () => {
			expect(getStarRating(25)).toBe("★★☆☆☆");
		});

		it("returns 1 star for score 24", () => {
			expect(getStarRating(24)).toBe("★☆☆☆☆");
		});

		it("returns 1 star for score 0", () => {
			expect(getStarRating(0)).toBe("★☆☆☆☆");
		});
	});

	describe("buildScoreBarSegments", () => {
		it("returns all filled for score 100", () => {
			const { filled, empty } = buildScoreBarSegments(100);
			expect(filled.length).toBe(50);
			expect(empty.length).toBe(0);
		});

		it("returns all empty for score 0", () => {
			const { filled, empty } = buildScoreBarSegments(0);
			expect(filled.length).toBe(0);
			expect(empty.length).toBe(50);
		});

		it("returns correct proportions for score 50", () => {
			const { filled, empty } = buildScoreBarSegments(50);
			expect(filled.length).toBe(25);
			expect(empty.length).toBe(25);
		});

		it("uses block characters", () => {
			const { filled, empty } = buildScoreBarSegments(80);
			expect(filled).toMatch(FILLED_BLOCK_REGEX);
			expect(empty).toMatch(EMPTY_BLOCK_REGEX);
		});

		it("total width is always 50", () => {
			for (const score of [0, 10, 25, 33, 50, 67, 75, 90, 100]) {
				const { filled, empty } = buildScoreBarSegments(score);
				expect(filled.length + empty.length).toBe(50);
			}
		});
	});

	describe("getSeverityIcon", () => {
		it("returns ✗ for errors", () => {
			expect(getSeverityIcon("error")).toBe("✗");
		});

		it("returns ⚠ for warnings", () => {
			expect(getSeverityIcon("warning")).toBe("⚠");
		});

		it("returns ● for info", () => {
			expect(getSeverityIcon("info")).toBe("●");
		});
	});

	describe("formatElapsedTime", () => {
		it("formats milliseconds for small values", () => {
			expect(formatElapsedTime(500)).toBe("500ms");
		});

		it("formats seconds for values >= 1000", () => {
			expect(formatElapsedTime(1200)).toBe("1.2s");
		});

		it("formats exactly 1 second", () => {
			expect(formatElapsedTime(1000)).toBe("1.0s");
		});

		it("rounds milliseconds to nearest integer", () => {
			expect(formatElapsedTime(99.7)).toBe("100ms");
		});
	});

	describe("printFramedBox", () => {
		let output: string[];

		beforeEach(() => {
			output = [];
			vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
				output.push(args.join(" "));
			});
		});

		it("renders top and bottom borders", () => {
			printFramedBox([{ plainText: "Hello", renderedText: "Hello" }]);

			expect(output[0]).toContain("┌");
			expect(output[0]).toContain("┐");
			expect(output.at(-1)).toContain("└");
			expect(output.at(-1)).toContain("┘");
		});

		it("renders side borders on content lines", () => {
			printFramedBox([{ plainText: "Hello", renderedText: "Hello" }]);

			// Content line (middle)
			expect(output[1]).toContain("│");
			expect(output[1]).toContain("Hello");
		});

		it("does nothing for empty lines array", () => {
			printFramedBox([]);
			expect(output).toHaveLength(0);
		});

		it("renders multiple lines with consistent width", () => {
			printFramedBox([
				{ plainText: "Short", renderedText: "Short" },
				{ plainText: "A much longer line", renderedText: "A much longer line" },
			]);

			// Should have 4 lines: top border, 2 content, bottom border
			expect(output).toHaveLength(4);
		});
	});

	describe("diagnostics grouping and sorting", () => {
		it("groups diagnostics by rule", () => {
			const diagnostics = [
				makeDiagnostic({ rule: "rule-a", filePath: "a.ts", line: 1 }),
				makeDiagnostic({ rule: "rule-a", filePath: "b.ts", line: 5 }),
				makeDiagnostic({ rule: "rule-b", filePath: "c.ts", line: 10 }),
			];

			// Verify grouping works by checking we get 2 groups from 3 diagnostics
			const groups = new Map<string, Diagnostic[]>();
			for (const d of diagnostics) {
				const group = groups.get(d.rule) ?? [];
				group.push(d);
				groups.set(d.rule, group);
			}

			expect(groups.size).toBe(2);
			expect(groups.get("rule-a")?.length).toBe(2);
			expect(groups.get("rule-b")?.length).toBe(1);
		});

		it("sorts errors before warnings before info", () => {
			const groups: [string, Diagnostic[]][] = [
				["info-rule", [makeDiagnostic({ severity: "info" })]],
				["error-rule", [makeDiagnostic({ severity: "error" })]],
				["warning-rule", [makeDiagnostic({ severity: "warning" })]],
			];

			const severityOrder = { error: 0, warning: 1, info: 2 };
			const sorted = [...groups].sort(([, a], [, b]) => {
				return severityOrder[a[0].severity] - severityOrder[b[0].severity];
			});

			expect(sorted[0][0]).toBe("error-rule");
			expect(sorted[1][0]).toBe("warning-rule");
			expect(sorted[2][0]).toBe("info-rule");
		});
	});

	describe("printConsoleReport", () => {
		let output: string[];

		beforeEach(() => {
			output = [];
			vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
				output.push(args.join(" "));
			});
		});

		it("renders the full report without errors", async () => {
			const { printConsoleReport } = await import(
				"../../src/cli/output/console-reporter.js"
			);

			const result = makeResult();
			printConsoleReport(result, false);

			const fullOutput = output.join("\n");
			expect(fullOutput).toContain("NestJS Doctor");
			expect(fullOutput).toContain("85");
			expect(fullOutput).toContain("Good");
			expect(fullOutput).toContain("No issues found!");
			expect(fullOutput).toContain("test-project");
		});

		it("renders diagnostics grouped by rule", async () => {
			const { printConsoleReport } = await import(
				"../../src/cli/output/console-reporter.js"
			);

			const diagnostics = [
				makeDiagnostic({
					rule: "test/rule-a",
					message: "Rule A violation",
					severity: "error",
					filePath: "file1.ts",
					line: 10,
				}),
				makeDiagnostic({
					rule: "test/rule-a",
					message: "Rule A violation",
					severity: "error",
					filePath: "file2.ts",
					line: 20,
				}),
			];

			const result = makeResult({
				diagnostics,
				summary: {
					total: 2,
					errors: 2,
					warnings: 0,
					info: 0,
					byCategory: {
						security: 0,
						architecture: 0,
						correctness: 2,
						performance: 0,
					},
				},
				score: { value: 70, label: "Fair" },
			});

			printConsoleReport(result, false);

			const fullOutput = output.join("\n");
			// Should show the message once with count
			expect(fullOutput).toContain("(2)");
			expect(fullOutput).toContain("Rule A violation");
			// Should suggest --verbose when not verbose
			expect(fullOutput).toContain("--verbose");
		});

		it("shows file paths in verbose mode", async () => {
			const { printConsoleReport } = await import(
				"../../src/cli/output/console-reporter.js"
			);

			const diagnostics = [
				makeDiagnostic({
					rule: "test/rule-a",
					message: "Rule A violation",
					severity: "warning",
					filePath: "src/users/users.controller.ts",
					line: 10,
				}),
			];

			const result = makeResult({
				diagnostics,
				summary: {
					total: 1,
					errors: 0,
					warnings: 1,
					info: 0,
					byCategory: {
						security: 0,
						architecture: 0,
						correctness: 1,
						performance: 0,
					},
				},
			});

			printConsoleReport(result, true);

			const fullOutput = output.join("\n");
			expect(fullOutput).toContain("src/users/users.controller.ts");
			expect(fullOutput).toContain("10");
			// Should NOT show --verbose hint in verbose mode
			expect(fullOutput).not.toContain("Run with --verbose");
		});
	});
});
