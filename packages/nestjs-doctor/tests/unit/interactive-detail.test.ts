import { describe, expect, it } from "vitest";
import {
	buildFixPrompt,
	groupFindings,
} from "../../src/cli/interactive/findings.js";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";

const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	category: "security",
	column: 3,
	filePath: "/app/src/users.controller.ts",
	help: "Add @UseGuards to the controller.",
	line: 12,
	message: "Endpoint has no guard.",
	rule: "security/require-auth-guards",
	severity: "warning",
	...overrides,
});

describe("groupFindings", () => {
	it("orders by severity, then count, then rule id", () => {
		const diagnostics: Diagnostic[] = [
			code({ rule: "performance/b", severity: "info" }),
			code({ rule: "correctness/a", severity: "error" }),
			code({ rule: "security/c", severity: "warning" }),
			code({ rule: "security/c", severity: "warning", line: 20 }),
			code({ rule: "architecture/d", severity: "warning" }),
		];
		const groups = groupFindings(diagnostics);
		expect(groups.map((group) => group.rule)).toEqual([
			"correctness/a",
			"security/c",
			"architecture/d",
			"performance/b",
		]);
		expect(groups[1].diagnostics).toHaveLength(2);
	});

	it("keeps severity order inside the scored groups", () => {
		const groups = groupFindings([
			code({ rule: "security/b", severity: "warning" }),
			code({ rule: "correctness/a", severity: "error" }),
		]);
		expect(groups.map((group) => group.rule)).toEqual([
			"correctness/a",
			"security/b",
		]);
	});

	it("lists a not-scored warning group after a scored info group", () => {
		const groups = groupFindings([
			code({
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				surfaces: ["cli"],
			}),
			code({ rule: "performance/no-unused-providers", severity: "info" }),
		]);
		expect(groups[0].rule).toBe("performance/no-unused-providers");
		expect(groups[1].rule).toBe("correctness/prefer-readonly-injection");
	});

	it("marks the group as not scored", () => {
		const groups = groupFindings([
			code({
				rule: "correctness/prefer-readonly-injection",
				surfaces: ["cli"],
			}),
			code({ rule: "performance/no-unused-providers" }),
		]);
		expect(
			groups.find(
				(group) => group.rule === "correctness/prefer-readonly-injection"
			)?.scored
		).toBe(false);
		expect(
			groups.find((group) => group.rule === "performance/no-unused-providers")
				?.scored
		).toBe(true);
	});
});

describe("buildFixPrompt", () => {
	it("carries the rule, the locations, and the verification command", () => {
		const prompt = buildFixPrompt(
			{
				diagnostics: [code({}), code({ line: 40, column: 1 })],
				rule: "security/require-auth-guards",
				scored: true,
				severity: "warning",
			},
			"/app"
		);
		expect(prompt).toContain("security/require-auth-guards");
		expect(prompt).toContain("/app/src/users.controller.ts:12:3");
		expect(prompt).toContain("/app/src/users.controller.ts:40:1");
		expect(prompt).toContain("do not suppress");
		expect(prompt).toContain("npx nestjs-doctor@latest .");
	});

	it("caps the location list at ten and says how many more", () => {
		const many = Array.from({ length: 14 }, (_, index) =>
			code({ line: index + 1 })
		);
		const prompt = buildFixPrompt(
			{ diagnostics: many, rule: "r/x", scored: true, severity: "info" },
			"/app"
		);
		expect(prompt.match(/^- \//gm)).toHaveLength(10);
		expect(prompt).toContain("and 4 more");
	});
});
