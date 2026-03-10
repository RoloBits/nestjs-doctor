import type { NestjsDoctorConfig } from "../../common/config.js";
import { allRules } from "../rules/index.js";
import {
	filterRules,
	mergeRules,
	separateRules,
} from "../rules/rule-pipeline.js";
import type { AnyRule, ProjectRule, Rule, SchemaRule } from "../rules/types.js";
import { loadCustomRules } from "./custom-rule-loader.js";
import { loadConfig } from "./loader.js";

export interface ScanConfig {
	combinedRules: AnyRule[];
	config: NestjsDoctorConfig;
	customRuleWarnings: string[];
	fileRules: Rule[];
	projectRules: ProjectRule[];
	schemaRules: SchemaRule[];
}

export function resolveCustomRules(
	config: NestjsDoctorConfig,
	targetPath: string
): Promise<{ rules: AnyRule[]; warnings: string[] }> {
	if (!config.customRulesDir) {
		return Promise.resolve({ rules: [], warnings: [] });
	}
	return loadCustomRules(config.customRulesDir, targetPath);
}

export async function resolveScanConfig(
	targetPath: string,
	configPath?: string
): Promise<ScanConfig> {
	const config = await loadConfig(targetPath, configPath);

	const { rules: customRules, warnings: customRuleWarnings } =
		await resolveCustomRules(config, targetPath);
	const combinedRules = mergeRules(allRules, customRules, customRuleWarnings);

	const rules = filterRules(config, combinedRules);
	const { fileRules, projectRules, schemaRules } = separateRules(rules);

	return {
		combinedRules,
		config,
		customRuleWarnings,
		fileRules,
		projectRules,
		schemaRules,
	};
}
