import { describe, expect, it } from "vitest";
import { ruleInfo } from "../../src/cli/interactive/rule-info.js";
import { buildPanelLines } from "../../src/cli/interactive/tui/panel.js";

const plain = (lines: ReturnType<typeof buildPanelLines>): string[] =>
	lines.map((line) => line.spans.map((span) => span.text).join(""));

const codeDiagnostic = {
	category: "security" as const,
	column: 5,
	filePath: "src/app.service.ts",
	help: "Move the secret to config",
	line: 12,
	message: "Hardcoded secret found",
	rule: "security/no-hardcoded-secrets",
	severity: "error" as const,
	sourceLines: [
		{ line: 11, text: "export class AppService {" },
		{ line: 12, text: '  apiKey = "sk-live-123";' },
	],
};

describe("buildPanelLines", () => {
	const panel = plain(
		buildPanelLines(
			codeDiagnostic,
			{
				bad: "const a = 1;\nconst b = 2;",
				description: "Do not do the thing.",
				good: "const c = 3;",
			},
			100
		)
	);

	it("leads with the rule id and a severity badge", () => {
		expect(panel[0]).toContain("security/no-hardcoded-secrets");
		expect(panel[0]).toContain("ERROR");
	});

	it("shows the message and the location", () => {
		expect(panel).toContain("Hardcoded secret found");
		expect(panel.some((line) => line.includes("src/app.service.ts:12:5"))).toBe(
			true
		);
	});

	it("renders the code window with the target marked", () => {
		expect(
			panel.some((line) => line.includes("›") && line.includes("apiKey"))
		).toBe(true);
	});

	it("puts the bad sample before the good one", () => {
		const bad = panel.findIndex((line) => line.includes("BAD"));
		const good = panel.findIndex((line) => line.includes("GOOD"));
		expect(bad).toBeGreaterThan(-1);
		expect(good).toBeGreaterThan(bad);
	});

	it("marks every sample line so the pair survives without colour", () => {
		expect(panel.filter((line) => line.startsWith("  - "))).toHaveLength(2);
		expect(panel.filter((line) => line.startsWith("  + "))).toHaveLength(1);
	});

	it("captions the recommendation in uppercase with the docs link", () => {
		const row = panel.find((line) => line.startsWith("RECOMMENDATION"));
		expect(row).toContain("https://nestjs.doctor/docs/rules/security");
	});

	it("wraps a message wider than the panel onto several lines", () => {
		const wrapped = plain(
			buildPanelLines(
				{
					...codeDiagnostic,
					message: "word ".repeat(60).trim(),
				},
				{},
				40
			)
		);
		const messageRows = wrapped.filter((line) => line.startsWith("word "));
		expect(messageRows.length).toBeGreaterThan(1);
		for (const row of messageRows) {
			expect(row.length).toBeLessThanOrEqual(40);
		}
	});

	it("keeps every line inside the width it was given", () => {
		const wide = plain(
			buildPanelLines(
				codeDiagnostic,
				{ bad: "x".repeat(300), description: "y ".repeat(200), good: "z" },
				80
			)
		);
		for (const line of wide) {
			expect(line.length).toBeLessThanOrEqual(80);
		}
	});

	it("omits the samples when only a description exists", () => {
		const only = plain(
			buildPanelLines(codeDiagnostic, { description: "Just this." }, 60)
		);
		expect(only.some((line) => line.includes("BAD"))).toBe(false);
		expect(only.some((line) => line.includes("Just this."))).toBe(true);
	});
});

describe("ruleInfo", () => {
	it("carries the description and the sample pair for a built-in rule", () => {
		const info = ruleInfo("security/no-hardcoded-secrets");
		expect(info.description).toBeTruthy();
		expect(info.bad).toContain("apiKey");
		expect(info.good).toContain("ConfigService");
	});

	it("is empty for a custom rule, which has neither", () => {
		expect(ruleInfo("custom/whatever")).toEqual({});
	});

	it("still carries a description for a rule with no samples", () => {
		const info = ruleInfo("security/no-vulnerable-nestjs-packages");
		expect(info.description).toBeTruthy();
		expect(info.bad).toBeUndefined();
	});
});
