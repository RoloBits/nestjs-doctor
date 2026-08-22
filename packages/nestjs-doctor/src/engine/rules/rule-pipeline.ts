import type { NestjsDoctorConfig } from "../../common/config.js";
import type { AnyRule, ProjectRule, Rule, SchemaRule } from "./types.js";
import { isProjectRule, isSchemaRule } from "./types.js";

export function mergeRules(
	builtInRules: AnyRule[],
	customRules: AnyRule[],
	warnings: string[]
): AnyRule[] {
	if (customRules.length === 0) {
		return builtInRules;
	}

	const builtInIds = new Set(builtInRules.map((r) => r.meta.id));
	const merged = [...builtInRules];

	for (const rule of customRules) {
		if (builtInIds.has(rule.meta.id)) {
			warnings.push(
				`Custom rule "${rule.meta.id}" conflicts with a built-in rule and was skipped`
			);
			continue;
		}
		merged.push(rule);
	}

	return merged;
}

/** A rule with `config.rules[id].surfaces` applied over its own declaration. */
const withConfiguredSurfaces = (
	config: NestjsDoctorConfig,
	rule: AnyRule
): AnyRule => {
	const ruleConfig = config.rules?.[rule.meta.id];
	const surfaces =
		typeof ruleConfig === "object" ? ruleConfig.surfaces : undefined;
	if (!surfaces) {
		return rule;
	}
	return { ...rule, meta: { ...rule.meta, surfaces } } as AnyRule;
};

export function filterRules(
	config: NestjsDoctorConfig,
	rules: AnyRule[]
): AnyRule[] {
	return rules
		.filter((rule) => {
			const ruleConfig = config.rules?.[rule.meta.id];
			if (ruleConfig === false) {
				return false;
			}
			if (typeof ruleConfig === "object" && ruleConfig.enabled === false) {
				return false;
			}

			const categoryEnabled = config.categories?.[rule.meta.category];
			if (categoryEnabled === false) {
				return false;
			}

			return true;
		})
		.map((rule) => withConfiguredSurfaces(config, rule));
}

export function separateRules(rules: AnyRule[]): {
	fileRules: Rule[];
	projectRules: ProjectRule[];
	schemaRules: SchemaRule[];
} {
	const fileRules: Rule[] = [];
	const projectRules: ProjectRule[] = [];
	const schemaRules: SchemaRule[] = [];

	for (const rule of rules) {
		if (isSchemaRule(rule)) {
			schemaRules.push(rule);
		} else if (isProjectRule(rule)) {
			projectRules.push(rule);
		} else {
			fileRules.push(rule);
		}
	}

	return { fileRules, projectRules, schemaRules };
}
