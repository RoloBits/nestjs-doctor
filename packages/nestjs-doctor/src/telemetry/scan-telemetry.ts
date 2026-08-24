import type { BlockingLevel } from "../cli/blocking.js";
import { DEFAULT_CONFIG, type NestjsDoctorConfig } from "../common/config.js";
import type { Diagnostic } from "../common/diagnostic.js";
import type { RuleErrorInfo, Score } from "../common/result.js";
import type { ScopeMode } from "../common/scope.js";
import { allRules } from "../engine/rules/index.js";
import type { EcosystemFacts } from "./ecosystem.js";
import type { ActionFacts, VersionPin } from "./environment.js";

/** Every rule id the payload may name. */
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
	action: ActionFacts;
	blocking: BlockingLevel;
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
	projectId?: string;
	ruleErrors: RuleErrorInfo[];
	scope: ScopeMode;
	score: Score;
	source: "ci" | "cli";
	version: string;
}

export interface ScanPayload {
	action_comment: boolean | null;
	action_commit_status: boolean | null;
	action_ref: string | null;
	action_review_comments: boolean | null;
	action_sarif: boolean | null;
	action_version_pin: VersionPin | null;
	actor_association: string | null;
	blocking: BlockingLevel;
	categories_disabled: string[];
	ci_event: string | null;
	ci_provider: string | null;
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
	project_id?: string;
	rule_errors: string[];
	rule_overrides: string[];
	rules_disabled: string[];
	rules_turned_off: string[];
	rules_with_findings: number;
	scope: ScopeMode;
	score: number;
	version: string;
	via_action: boolean;
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
	// The config arrives default-merged; report what the project declared.
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

/** Builds the scan payload from rule metadata, never from the scanned code. */
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
		action_commit_status: facts.action.actionCommitStatus,
		action_comment: facts.action.actionComment,
		action_ref: facts.action.actionRef,
		action_review_comments: facts.action.actionReviewComments,
		action_sarif: facts.action.actionSarif,
		action_version_pin: facts.action.actionVersionPin,
		actor_association: facts.action.actorAssociation,
		blocking: facts.blocking,
		categories_disabled: facts.config.categoriesDisabled,
		ci_event: facts.action.ciEvent,
		ci_provider: facts.action.ciProvider,
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
		...(facts.projectId ? { project_id: facts.projectId } : {}),
		// Rule ids only; the error message quotes the file that broke the rule.
		rule_errors: builtInOnly(facts.ruleErrors.map((e) => e.ruleId)),
		rule_overrides: facts.config.ruleOverrides,
		rules_turned_off: facts.config.rulesTurnedOff,
		rules_disabled: builtInOnly(facts.disabledRuleIds),
		rules_with_findings: Object.keys(findings).length,
		scope: facts.scope,
		score: facts.score.value,
		version: facts.version,
		via_action: facts.action.viaAction,
	};
}
