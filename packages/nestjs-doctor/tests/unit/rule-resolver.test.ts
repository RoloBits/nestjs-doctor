import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	mergeRules,
	resolveCustomRules,
} from "../../src/core/rule-resolver.js";
import type { AnyRule } from "../../src/rules/types.js";

const fixturesDir = path.resolve(
	import.meta.dirname,
	"../fixtures/custom-rules"
);

function stubRule(id: string): AnyRule {
	return {
		meta: {
			id,
			category: "correctness",
			severity: "warning",
			description: `stub ${id}`,
			help: "stub help",
		},
		check() {
			// stub
		},
	} as AnyRule;
}

describe("mergeRules", () => {
	it("returns built-in rules unchanged when custom rules are empty", () => {
		const builtIn = [stubRule("rule-a"), stubRule("rule-b")];
		const warnings: string[] = [];

		const result = mergeRules(builtIn, [], warnings);

		expect(result).toBe(builtIn);
		expect(warnings).toHaveLength(0);
	});

	it("appends non-conflicting custom rules", () => {
		const builtIn = [stubRule("rule-a"), stubRule("rule-b")];
		const custom = [stubRule("custom/rule-c")];
		const warnings: string[] = [];

		const result = mergeRules(builtIn, custom, warnings);

		expect(result).toHaveLength(3);
		expect(result[2].meta.id).toBe("custom/rule-c");
		expect(warnings).toHaveLength(0);
	});

	it("skips conflicting custom rules with a warning", () => {
		const builtIn = [stubRule("rule-a")];
		const custom = [stubRule("rule-a")];
		const warnings: string[] = [];

		const result = mergeRules(builtIn, custom, warnings);

		expect(result).toHaveLength(1);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("rule-a");
		expect(warnings[0]).toContain("conflicts");
	});

	it("handles mix of conflicting and non-conflicting custom rules", () => {
		const builtIn = [stubRule("rule-a"), stubRule("rule-b")];
		const custom = [stubRule("rule-a"), stubRule("custom/rule-c")];
		const warnings: string[] = [];

		const result = mergeRules(builtIn, custom, warnings);

		expect(result).toHaveLength(3);
		expect(result.map((r) => r.meta.id)).toEqual([
			"rule-a",
			"rule-b",
			"custom/rule-c",
		]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("rule-a");
	});
});

describe("resolveCustomRules", () => {
	it("returns empty when customRulesDir is undefined", async () => {
		const result = await resolveCustomRules({}, "/tmp");

		expect(result).toEqual({ rules: [], warnings: [] });
	});

	it("delegates to loadCustomRules when customRulesDir is set", async () => {
		const result = await resolveCustomRules(
			{ customRulesDir: fixturesDir },
			"/tmp"
		);

		expect(result.rules.length).toBeGreaterThan(0);
		expect(result.rules.some((r) => r.meta.id.startsWith("custom/"))).toBe(
			true
		);
	});
});
