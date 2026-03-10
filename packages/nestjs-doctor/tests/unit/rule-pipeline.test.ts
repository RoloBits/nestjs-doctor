import { describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../src/common/config.js";
import {
	filterRules,
	separateRules,
} from "../../src/engine/rules/rule-pipeline.js";
import type { AnyRule, RuleScope } from "../../src/engine/rules/types.js";

function stubRule(
	id: string,
	overrides: { category?: string; scope?: RuleScope } = {}
): AnyRule {
	return {
		meta: {
			id,
			category: overrides.category ?? "correctness",
			severity: "warning",
			description: `stub ${id}`,
			help: "stub help",
			scope: overrides.scope,
		},
		check() {
			// stub
		},
	} as AnyRule;
}

describe("filterRules", () => {
	it("excludes a rule disabled with `false`", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
			stubRule("security/no-hardcoded-secrets", { category: "security" }),
		];
		const config: NestjsDoctorConfig = {
			rules: { "architecture/no-barrel-export-internals": false },
		};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(1);
		expect(result[0].meta.id).toBe("security/no-hardcoded-secrets");
	});

	it("excludes a rule disabled with `{ enabled: false }`", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
		];
		const config: NestjsDoctorConfig = {
			rules: {
				"architecture/no-barrel-export-internals": { enabled: false },
			},
		};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(0);
	});

	it("excludes all rules in a disabled category", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
			stubRule("architecture/no-business-logic-in-controllers", {
				category: "architecture",
			}),
			stubRule("security/no-hardcoded-secrets", { category: "security" }),
		];
		const config: NestjsDoctorConfig = {
			categories: { architecture: false },
		};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(1);
		expect(result[0].meta.id).toBe("security/no-hardcoded-secrets");
	});

	it("keeps rules that are not mentioned in config", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
			stubRule("security/no-hardcoded-secrets", { category: "security" }),
		];
		const config: NestjsDoctorConfig = {
			rules: { "some-other/rule": false },
		};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(2);
	});

	it("keeps all rules when config is empty", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
			stubRule("security/no-hardcoded-secrets", { category: "security" }),
		];
		const config: NestjsDoctorConfig = {};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(2);
	});

	it("excludes both no-barrel-export-internals and no-hardcoded-secrets simultaneously", () => {
		const rules = [
			stubRule("architecture/no-barrel-export-internals", {
				category: "architecture",
			}),
			stubRule("security/no-hardcoded-secrets", { category: "security" }),
			stubRule("correctness/prefer-readonly-injection"),
		];
		const config: NestjsDoctorConfig = {
			rules: {
				"architecture/no-barrel-export-internals": false,
				"security/no-hardcoded-secrets": false,
			},
		};

		const result = filterRules(config, rules);

		expect(result).toHaveLength(1);
		expect(result[0].meta.id).toBe("correctness/prefer-readonly-injection");
	});
});

describe("separateRules", () => {
	it("puts rules without scope into fileRules", () => {
		const rules = [stubRule("file-rule-a"), stubRule("file-rule-b")];

		const { fileRules, projectRules, schemaRules } = separateRules(rules);

		expect(fileRules).toHaveLength(2);
		expect(projectRules).toHaveLength(0);
		expect(schemaRules).toHaveLength(0);
	});

	it("puts rules with scope 'project' into projectRules", () => {
		const rules = [stubRule("proj-rule", { scope: "project" })];

		const { fileRules, projectRules, schemaRules } = separateRules(rules);

		expect(fileRules).toHaveLength(0);
		expect(projectRules).toHaveLength(1);
		expect(projectRules[0].meta.id).toBe("proj-rule");
		expect(schemaRules).toHaveLength(0);
	});

	it("puts rules with scope 'schema' into schemaRules", () => {
		const rules = [stubRule("schema-rule", { scope: "schema" })];

		const { fileRules, projectRules, schemaRules } = separateRules(rules);

		expect(fileRules).toHaveLength(0);
		expect(projectRules).toHaveLength(0);
		expect(schemaRules).toHaveLength(1);
		expect(schemaRules[0].meta.id).toBe("schema-rule");
	});

	it("separates mixed rules into correct buckets", () => {
		const rules = [
			stubRule("file-rule"),
			stubRule("proj-rule", { scope: "project" }),
			stubRule("schema-rule", { scope: "schema" }),
		];

		const { fileRules, projectRules, schemaRules } = separateRules(rules);

		expect(fileRules).toHaveLength(1);
		expect(projectRules).toHaveLength(1);
		expect(schemaRules).toHaveLength(1);
	});
});
