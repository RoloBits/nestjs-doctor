import type { Project, SourceFile } from "ts-morph";
import type { NestjsDoctorConfig } from "../../common/config.js";
import type {
	Category,
	CodeDiagnostic,
	DiagnosticSurface,
	SchemaDiagnostic,
	Severity,
} from "../../common/diagnostic.js";
import type { SchemaGraph } from "../../common/schema.js";
import type { ModuleGraph } from "../graph/module-graph.js";
import type { ProviderInfo } from "../graph/type-resolver.js";

// ── Shared ──

export type RuleScope = "file" | "project" | "schema";

export interface RuleMeta {
	category: Category;
	description: string;
	help: string;
	id: string;
	scope?: RuleScope;
	severity: Severity;
	/**
	 * Where the rule's diagnostics may appear. Omitted means every surface.
	 * `["cli"]` reports without touching the score or failing a build.
	 */
	surfaces?: readonly DiagnosticSurface[];
	/**
	 * Labels stamped onto every diagnostic the rule emits. `module-graph`
	 * marks module wiring rules for the report's problems drawer.
	 */
	tags?: readonly string[];
}

// ── Contexts ──

/** Guard facts a single file cannot see. Absent means "not determined". */
export interface GuardFacts {
	/** Decorator names whose implementation composes `UseGuards`. */
	composedDecorators: ReadonlySet<string>;
	/** Some module registers a guard through `APP_GUARD`. */
	globallyRegistered: boolean;
	/** Base classes some subclass guards, so the base's handlers are covered. */
	guardedBaseClasses: ReadonlySet<string>;
}

export interface CodeRuleContext {
	config?: NestjsDoctorConfig;
	/** Classes NestJS instantiates itself, which one file cannot enumerate. */
	diProviders?: ReadonlySet<string>;
	filePath: string;
	guards?: GuardFacts;
	/** Directories that hold a module file, for boundary checks. */
	moduleDirectories?: ReadonlySet<string>;
	report(
		diagnostic: Omit<CodeDiagnostic, "rule" | "category" | "severity" | "scope">
	): void;
	sourceFile: SourceFile;
}

export interface ProjectRuleContext {
	config: NestjsDoctorConfig;
	files: string[];
	moduleGraph: ModuleGraph;
	project: Project;
	providers: Map<string, ProviderInfo>;
	report(
		diagnostic: Omit<CodeDiagnostic, "rule" | "category" | "severity" | "scope">
	): void;
}

export interface SchemaRuleContext {
	orm: string;
	report(
		diagnostic: Omit<
			SchemaDiagnostic,
			"rule" | "category" | "severity" | "scope"
		>
	): void;
	schemaGraph: SchemaGraph;
}

// ── Rules ──

export interface Rule {
	check(context: CodeRuleContext): void;
	meta: RuleMeta;
}

export interface ProjectRule {
	check(context: ProjectRuleContext): void;
	meta: RuleMeta;
}

export interface SchemaRule {
	check(context: SchemaRuleContext): void;
	meta: RuleMeta;
}

export type AnyRule = Rule | ProjectRule | SchemaRule;

// ── Type guards ──

export function isProjectRule(rule: AnyRule): rule is ProjectRule {
	return rule.meta.scope === "project";
}

export function isSchemaRule(rule: AnyRule): rule is SchemaRule {
	return rule.meta.scope === "schema";
}
