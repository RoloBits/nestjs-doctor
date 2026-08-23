import { DEFAULT_CONFIG, type NestjsDoctorConfig } from "../common/config.js";
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

/** How a project is configured. Globs and the rules directory are counted. */
export interface ConfigFacts {
	categoriesDisabled: string[];
	customRulesDir: boolean;
	excludeCount: number;
	ignoredFileCount: number;
	ignoredRules: string[];
	includeCount: number;
	minScore: number | null;
	ruleOverrides: string[];
	rulesTurnedOff: string[];
}

export interface ScanFacts {
	config: ConfigFacts;
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
	categories_disabled: string[];
	cloud: string[];
	cloud_services: string[];
	config_exclude_count: number;
	config_include_count: number;
	config_min_score: number | null;
	custom_rules_dir: boolean;
	custom_rules_loaded: number;
	databases: string[];
	duration_ms: number;
	file_count: number;
	findings: Record<string, Record<string, number>>;
	framework: string | null;
	frontend: string[];
	generated_in: "ci" | "cli";
	ignored_file_count: number;
	ignored_rules: string[];
	messaging: string[];
	monorepo: boolean;
	nest_version: string | null;
	nestjs_packages: string[];
	node_major: number;
	orm: string | null;
	platform: string;
	project_id: string;
	rule_errors: string[];
	rule_overrides: string[];
	rules_disabled: string[];
	rules_turned_off: string[];
	rules_with_findings: number;
	score: number;
	version: string;
}

const NODE_VERSION_PREFIX_RE = /^v/;

/** The only category names the payload may carry. */
const CATEGORIES: readonly string[] = [
	"architecture",
	"correctness",
	"performance",
	"schema",
	"security",
];

const DEFAULT_EXCLUDES = DEFAULT_CONFIG.exclude?.length ?? 0;
const DEFAULT_INCLUDES = DEFAULT_CONFIG.include ?? [];

/** Reads the config's shape. Returns no path and no glob. */
export function readConfigFacts(config: NestjsDoctorConfig = {}): ConfigFacts {
	const rules = config.rules ?? {};
	const turnedOff = Object.keys(rules).filter((id) => {
		const value = rules[id];
		return (
			value === false ||
			(typeof value === "object" && value !== null && value.enabled === false)
		);
	});

	const categories = config.categories ?? {};
	const include = config.include ?? [];
	// `exclude` appends to the defaults and `include` replaces them, so subtract
	// what the merge added to report what the project declared.
	const declaredIncludes =
		include.length === DEFAULT_INCLUDES.length &&
		include.every((glob, index) => glob === DEFAULT_INCLUDES[index])
			? 0
			: include.length;

	return {
		categoriesDisabled: CATEGORIES.filter(
			(name) => categories[name as never] === false
		),
		customRulesDir: Boolean(config.customRulesDir),
		excludeCount: Math.max((config.exclude?.length ?? 0) - DEFAULT_EXCLUDES, 0),
		ignoredFileCount: config.ignore?.files?.length ?? 0,
		ignoredRules: builtInOnly(config.ignore?.rules ?? []),
		includeCount: declaredIncludes,
		minScore: config.minScore ?? null,
		ruleOverrides: builtInOnly(Object.keys(rules)),
		rulesTurnedOff: builtInOnly(turnedOff),
	};
}

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
		categories_disabled: facts.config.categoriesDisabled,
		cloud: facts.ecosystem.cloud,
		cloud_services: facts.ecosystem.cloudServices,
		config_exclude_count: facts.config.excludeCount,
		config_include_count: facts.config.includeCount,
		config_min_score: facts.config.minScore,
		custom_rules_dir: facts.config.customRulesDir,
		custom_rules_loaded: facts.customRulesLoaded,
		databases: facts.ecosystem.databases,
		duration_ms: Math.round(facts.elapsedMs),
		file_count: facts.fileCount,
		findings,
		framework: facts.framework,
		frontend: facts.ecosystem.frontend,
		generated_in: facts.source,
		ignored_file_count: facts.config.ignoredFileCount,
		ignored_rules: facts.config.ignoredRules,
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
		rule_overrides: facts.config.ruleOverrides,
		rules_turned_off: facts.config.rulesTurnedOff,
		rules_disabled: builtInOnly(facts.disabledRuleIds),
		rules_with_findings: Object.keys(findings).length,
		score: facts.score.value,
		version: facts.version,
	};
}
