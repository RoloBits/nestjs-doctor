import { describe, expect, it } from "vitest";
import { ruleInfo } from "../../src/cli/interactive/rule-info.js";
import { renderRulePanel } from "../../src/cli/interactive/rule-panel.js";

const ANSI_RE = /\[[0-9;]*m/g;

const plain = (lines: string[]): string[] =>
	lines.map((line) => line.replace(ANSI_RE, ""));

describe("renderRulePanel", () => {
	const panel = plain(
		renderRulePanel(
			{
				bad: "const a = 1;\nconst b = 2;",
				description: "Do not do the thing.",
				good: "const c = 3;",
			},
			"https://nestjs.doctor/docs/rules/security",
			100
		)
	);

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

	it("keeps every line inside the width it was given", () => {
		const wide = plain(
			renderRulePanel(
				{ bad: "x".repeat(300), description: "y ".repeat(200), good: "z" },
				undefined,
				80
			)
		);
		for (const line of wide) {
			expect(line.length).toBeLessThanOrEqual(80);
		}
	});

	it("renders nothing for a rule that carries neither", () => {
		expect(renderRulePanel({})).toEqual([]);
	});

	it("omits the samples when only a description exists", () => {
		const only = plain(renderRulePanel({ description: "Just this." }));
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
