import { describe, expect, it } from "vitest";
import { buildHandoffPrompt } from "../../src/cli/interactive/agents.js";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";

const finding = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	category: "security",
	column: 1,
	filePath: "/app/src/a.ts",
	help: "Do the fix.",
	line: 1,
	message: "Something is off.",
	rule: "security/a",
	severity: "warning",
	...overrides,
});

describe("buildHandoffPrompt", () => {
	it("carries the top three rules and points at the rest", () => {
		const diagnostics = [
			finding({ rule: "security/a", severity: "error" }),
			finding({ rule: "correctness/b" }),
			finding({ rule: "architecture/c" }),
			finding({ rule: "performance/d", severity: "info" }),
		];
		const prompt = buildHandoffPrompt(diagnostics, "/app");
		expect(prompt).toContain("findings for 4 rules");
		expect(prompt).toContain("security/a");
		expect(prompt).toContain("correctness/b");
		expect(prompt).toContain("architecture/c");
		expect(prompt).not.toContain("performance/d");
		expect(prompt).toContain("1 more rule reported");
		expect(prompt).toContain("npx nestjs-doctor@latest . --json");
	});

	it("leads with a not-scored error over scored infos", () => {
		const prompt = buildHandoffPrompt(
			[
				finding({ rule: "performance/one", severity: "info" }),
				finding({ rule: "performance/two", severity: "info" }),
				finding({ rule: "performance/three", severity: "info" }),
				finding({
					rule: "security/no-vulnerable-nestjs-packages",
					severity: "error",
					surfaces: ["cli"],
				}),
			],
			"/app"
		);
		expect(
			prompt.indexOf("security/no-vulnerable-nestjs-packages")
		).toBeLessThan(prompt.indexOf("performance/"));
		expect(prompt).toContain("1 more rule reported");
	});

	it("orders the sections worst first", () => {
		const prompt = buildHandoffPrompt(
			[
				finding({ rule: "performance/slow", severity: "info" }),
				finding({ rule: "security/bad", severity: "error" }),
			],
			"/app"
		);
		expect(prompt.indexOf("security/bad")).toBeLessThan(
			prompt.indexOf("performance/slow")
		);
	});
});
