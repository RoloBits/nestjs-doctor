import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import type { AnyRule } from "../rules/types.js";

const VALID_CATEGORIES = new Set<string>([
	"security",
	"performance",
	"correctness",
	"architecture",
]);
const VALID_SEVERITIES = new Set<string>(["error", "warning", "info"]);
const VALID_SCOPES = new Set<string>(["file", "project"]);
const CUSTOM_PREFIX = "custom/";

export interface LoadCustomRulesResult {
	rules: AnyRule[];
	warnings: string[];
}

function isValidRule(value: unknown): value is AnyRule {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	if (typeof obj.check !== "function") {
		return false;
	}

	if (typeof obj.meta !== "object" || obj.meta === null) {
		return false;
	}

	const meta = obj.meta as Record<string, unknown>;

	if (typeof meta.id !== "string" || meta.id.trim() === "") {
		return false;
	}
	if (typeof meta.description !== "string") {
		return false;
	}
	if (typeof meta.help !== "string") {
		return false;
	}
	if (!VALID_CATEGORIES.has(meta.category as string)) {
		return false;
	}
	if (!VALID_SEVERITIES.has(meta.severity as string)) {
		return false;
	}
	if (meta.scope !== undefined && !VALID_SCOPES.has(meta.scope as string)) {
		return false;
	}

	return true;
}

function prefixRuleId(rule: AnyRule): AnyRule {
	if (!rule.meta.id.startsWith(CUSTOM_PREFIX)) {
		return {
			...rule,
			meta: {
				...rule.meta,
				id: `${CUSTOM_PREFIX}${rule.meta.id}`,
			},
		} as AnyRule;
	}
	return rule;
}

export async function loadCustomRules(
	customRulesDir: string,
	projectRoot: string
): Promise<LoadCustomRulesResult> {
	const rules: AnyRule[] = [];
	const warnings: string[] = [];

	const resolvedDir = resolve(projectRoot, customRulesDir);

	if (!existsSync(resolvedDir)) {
		warnings.push(`Custom rules directory not found: ${resolvedDir}`);
		return { rules, warnings };
	}

	if (!statSync(resolvedDir).isDirectory()) {
		warnings.push(`Custom rules path is not a directory: ${resolvedDir}`);
		return { rules, warnings };
	}

	let entries: string[];
	try {
		entries = readdirSync(resolvedDir);
	} catch (error) {
		warnings.push(
			`Failed to read custom rules directory: ${error instanceof Error ? error.message : String(error)}`
		);
		return { rules, warnings };
	}

	const ruleFiles = entries.filter((entry) => entry.endsWith(".ts"));

	if (ruleFiles.length === 0) {
		warnings.push(`No rule files (.ts) found in: ${resolvedDir}`);
		return { rules, warnings };
	}

	const jiti = createJiti(resolvedDir, {
		interopDefault: true,
	});

	for (const file of ruleFiles) {
		const filePath = resolve(resolvedDir, file);

		let moduleExports: Record<string, unknown>;
		try {
			moduleExports = (await jiti.import(filePath)) as Record<string, unknown>;
		} catch (error) {
			warnings.push(
				`Failed to load custom rule file "${file}": ${error instanceof Error ? error.message : String(error)}`
			);
			continue;
		}

		let foundValidRule = false;
		for (const [exportName, exportValue] of Object.entries(moduleExports)) {
			if (isValidRule(exportValue)) {
				rules.push(prefixRuleId(exportValue));
				foundValidRule = true;
			} else if (
				exportName !== "__esModule" &&
				typeof exportValue === "object" &&
				exportValue !== null &&
				"meta" in exportValue
			) {
				warnings.push(
					`Invalid rule export "${exportName}" in "${file}": missing or invalid required fields (check, meta.id, meta.description, meta.help, meta.category, meta.severity)`
				);
			}
		}

		if (!foundValidRule && Object.keys(moduleExports).length > 0) {
			const hasRuleLikeExport = Object.values(moduleExports).some(
				(v) =>
					typeof v === "object" && v !== null && ("meta" in v || "check" in v)
			);
			if (!hasRuleLikeExport) {
				warnings.push(`No valid rule exports found in "${file}"`);
			}
		}
	}

	return { rules, warnings };
}
