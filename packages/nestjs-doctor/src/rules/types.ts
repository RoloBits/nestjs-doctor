import type { Project, SourceFile } from "ts-morph";
import type { ModuleGraph } from "../engine/module-graph.js";
import type { ProviderInfo } from "../engine/type-resolver.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type {
	Category,
	CodeDiagnostic,
	SchemaDiagnostic,
	Severity,
} from "../types/diagnostic.js";
import type { SchemaGraph } from "../types/schema.js";

// ── Shared ──

export type RuleScope = "file" | "project" | "schema";

export interface RuleMeta {
	category: Category;
	description: string;
	help: string;
	id: string;
	scope?: RuleScope;
	severity: Severity;
}

// ── Contexts ──

export interface CodeRuleContext {
	config?: NestjsDoctorConfig;
	filePath: string;
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
