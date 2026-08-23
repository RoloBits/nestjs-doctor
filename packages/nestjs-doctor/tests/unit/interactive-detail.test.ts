import { describe, expect, it } from "vitest";
import { renderCodeFrame } from "../../src/cli/interactive/code-frame.js";
import {
	buildFixPrompt,
	groupFindings,
} from "../../src/cli/interactive/detail.js";
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

describe("renderCodeFrame", () => {
	const frame = renderCodeFrame(
		[
			{ line: 11, text: "@Get()" },
			{ line: 12, text: "findAll() {" },
			{ line: 13, text: "  return [];" },
		],
		12,
		3
	);

	it("marks the offending line and no other", () => {
		const marked = frame
			.split("\n")
			.filter((row) => row.replace(/\[\d+m/g, "").startsWith(">"));
		expect(marked).toHaveLength(1);
		expect(marked[0]).toContain("findAll() {");
	});

	it("puts the caret under the column", () => {
		const rows = frame.split("\n").map((row) => row.replace(/\[\d+m/g, ""));
		const target = rows.findIndex((row) => row.startsWith(">"));
		const caretRow = rows[target + 1];
		const caretColumn = caretRow.indexOf("^");
		// "> 12 | " is 7 characters, then column 3 means 2 more.
		expect(caretColumn).toBe(rows[target].indexOf("|") + 2 + 3 - 1);
	});

	it("keeps every gutter number right-aligned", () => {
		const rows = frame.split("\n").map((row) => row.replace(/\[\d+m/g, ""));
		const pipes = new Set(
			rows.filter((row) => row.includes("|")).map((row) => row.indexOf("|"))
		);
		expect(pipes.size).toBe(1);
	});
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
});

describe("buildFixPrompt", () => {
	it("carries the rule, the locations, and the verification command", () => {
		const prompt = buildFixPrompt(
			{
				diagnostics: [code({}), code({ line: 40, column: 1 })],
				rule: "security/require-auth-guards",
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
			{ diagnostics: many, rule: "r/x", severity: "info" },
			"/app"
		);
		expect(prompt.match(/^- \//gm)).toHaveLength(10);
		expect(prompt).toContain("and 4 more");
	});
});
