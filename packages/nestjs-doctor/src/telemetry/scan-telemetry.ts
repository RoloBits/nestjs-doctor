import type { Diagnostic } from "../common/diagnostic.js";
import type { RuleErrorInfo, Score } from "../common/result.js";
import { allRules } from "../engine/rules/index.js";
import type { EcosystemFacts } from "./ecosystem.js";

/**
 * Every rule id the payload may name. A custom rule's id is a string its author
 * wrote, so anything outside this set is counted but never named.
 */
const BUILT_IN_RULE_IDS: ReadonlySet<string> = new Set(
	allRules.map((rule) => rule.meta.id)
);

export interface ScanFacts {
	customRulesLoaded: number;
	diagnostics: Diagnostic[];
	disabledRuleIds: string[];
	ecosystem: EcosystemFacts;
	elapsedMs: number;
	fileCount: number;
	framework: string | null;
	monorepo: boolean;
	nestVersion: string | null;
	orm: string | null;
	projectId: string;
	ruleErrors: RuleErrorInfo[];
	score: Score;
	source: "ci" | "cli";
	version: string;
}

export interface ScanPayload {
	cloud: string[];
	custom_rules_loaded: number;
	databases: string[];
	duration_ms: number;
	file_count: number;
	findings: Record<string, Record<string, number>>;
	framework: string | null;
	frontend: string[];
	generated_in: "ci" | "cli";
	messaging: string[];
	monorepo: boolean;
	nest_version: string | null;
	nestjs_packages: string[];
	node_major: number;
	orm: string | null;
	platform: string;
	project_id: string;
	rule_errors: string[];
	rules_disabled: string[];
	rules_with_findings: number;
	score: number;
	version: string;
}

const NODE_VERSION_PREFIX_RE = /^v/;

const builtInOnly = (ids: Iterable<string>): string[] =>
	[...new Set([...ids].filter((id) => BUILT_IN_RULE_IDS.has(id)))].sort();

/**
 * Builds the scan payload. Reads only rule ids and severities, both of which
 * come from rule metadata rather than the scanned code, so no path, source
 * line, project name, or custom rule name can reach it.
 */
export function buildScanPayload(
	facts: ScanFacts,
	nodeVersion: string = process.version,
	platform: string = process.platform
): ScanPayload {
	const findings: Record<string, Record<string, number>> = {};
	for (const diagnostic of facts.diagnostics) {
		if (!BUILT_IN_RULE_IDS.has(diagnostic.rule)) {
			continue;
		}
		const bySeverity = findings[diagnostic.rule] ?? {};
		bySeverity[diagnostic.severity] =
			(bySeverity[diagnostic.severity] ?? 0) + 1;
		findings[diagnostic.rule] = bySeverity;
	}

	return {
		cloud: facts.ecosystem.cloud,
		custom_rules_loaded: facts.customRulesLoaded,
		databases: facts.ecosystem.databases,
		duration_ms: Math.round(facts.elapsedMs),
		file_count: facts.fileCount,
		findings,
		framework: facts.framework,
		frontend: facts.ecosystem.frontend,
		generated_in: facts.source,
		messaging: facts.ecosystem.messaging,
		monorepo: facts.monorepo,
		nest_version: facts.nestVersion,
		nestjs_packages: facts.ecosystem.nestjsPackages,
		orm: facts.orm,
		node_major: Number.parseInt(
			nodeVersion.replace(NODE_VERSION_PREFIX_RE, ""),
			10
		),
		platform,
		project_id: facts.projectId,
		// Rule ids only. `RuleErrorInfo.error` is a raw thrown message and
		// routinely quotes the source file that broke the rule.
		rule_errors: builtInOnly(facts.ruleErrors.map((e) => e.ruleId)),
		rules_disabled: builtInOnly(facts.disabledRuleIds),
		rules_with_findings: Object.keys(findings).length,
		score: facts.score.value,
		version: facts.version,
	};
}
