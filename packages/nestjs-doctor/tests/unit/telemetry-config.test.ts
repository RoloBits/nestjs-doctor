import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/common/config.js";
import { readConfigFacts } from "../../src/telemetry/scan-telemetry.js";

describe("config facts", () => {
	it("counts the globs rather than sending them", () => {
		// The pipeline passes the default-merged config, so `exclude` arrives as
		// the defaults plus the project's own.
		const facts = readConfigFacts({
			exclude: [
				...(DEFAULT_CONFIG.exclude ?? []),
				"src/legacy-fraud-engine/**",
				"src/acme-vault/**",
			],
			ignore: { files: ["src/acme-secrets/vault.ts"] },
			include: ["src/acme-billing/**/*.ts"],
		});

		expect(facts.includeCount).toBe(1);
		expect(facts.excludeCount).toBe(2);
		expect(facts.ignoredFileCount).toBe(1);
		expect(JSON.stringify(facts)).not.toContain("acme");
		expect(JSON.stringify(facts)).not.toContain("**");
	});

	it("reads a project that declared nothing as unconfigured", () => {
		const facts = readConfigFacts({ ...DEFAULT_CONFIG });

		expect(facts.excludeCount).toBe(0);
		expect(facts.includeCount).toBe(0);
		expect(facts.minScore).toBeNull();
	});

	it("drops a category name it does not recognise", () => {
		const facts = readConfigFacts({
			categories: {
				"acme-internal-checks": false,
				performance: false,
			} as never,
		});

		expect(facts.categoriesDisabled).toEqual(["performance"]);
		expect(JSON.stringify(facts)).not.toContain("acme");
	});

	it("survives a null rule value", () => {
		expect(() =>
			readConfigFacts({ rules: { "security/no-eval": null } as never })
		).not.toThrow();
	});

	it("reports that custom rules are configured, not where", () => {
		const facts = readConfigFacts({ customRulesDir: "acme-private-rules" });

		expect(facts.customRulesDir).toBe(true);
		expect(JSON.stringify(facts)).not.toContain("acme-private-rules");
	});

	it("names built-in rules a project turned off", () => {
		const facts = readConfigFacts({
			rules: {
				"performance/no-sync-io": false,
				"security/no-eval": { enabled: false },
				"architecture/no-orm-in-controllers": { excludeClasses: ["Legacy"] },
			},
		});

		expect(facts.rulesTurnedOff).toEqual([
			"performance/no-sync-io",
			"security/no-eval",
		]);
		// An override that keeps the rule on still says the rule was configured.
		expect(facts.ruleOverrides).toContain("architecture/no-orm-in-controllers");
	});

	it("never names a custom rule, in any config field", () => {
		const facts = readConfigFacts({
			ignore: { rules: ["custom/acme-no-legacy-billing"] },
			rules: { "custom/acme-secret-scanner": false },
		});

		expect(JSON.stringify(facts)).not.toContain("acme");
		expect(facts.ignoredRules).toEqual([]);
		expect(facts.rulesTurnedOff).toEqual([]);
		expect(facts.ruleOverrides).toEqual([]);
	});

	it("keeps the score threshold and the disabled categories", () => {
		const facts = readConfigFacts({
			categories: { performance: false, schema: false, security: true },
			minScore: 87,
		});

		expect(facts.minScore).toBe(87);
		expect(facts.categoriesDisabled).toEqual(["performance", "schema"]);
	});

	it("reads an absent config as an unconfigured project", () => {
		expect(readConfigFacts()).toEqual({
			categoriesDisabled: [],
			customRulesDir: false,
			excludeCount: 0,
			ignoredFileCount: 0,
			ignoredRules: [],
			includeCount: 0,
			minScore: null,
			ruleOverrides: [],
			rulesTurnedOff: [],
		});
	});
});
