import type { AnyRule } from "../rules/types.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import { loadCustomRules } from "./custom-rule-loader.js";

export function resolveCustomRules(
	config: NestjsDoctorConfig,
	targetPath: string
): Promise<{ rules: AnyRule[]; warnings: string[] }> {
	if (!config.customRulesDir) {
		return Promise.resolve({ rules: [], warnings: [] });
	}
	return loadCustomRules(config.customRulesDir, targetPath);
}

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
