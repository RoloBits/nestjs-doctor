import type { Project, SourceFile } from "ts-morph";
import type { ModuleGraph } from "../engine/module-graph.js";
import type { ProviderInfo } from "../engine/type-resolver.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { Category, Diagnostic, Severity } from "../types/diagnostic.js";

export type RuleScope = "file" | "project";

export interface RuleMeta {
	category: Category;
	description: string;
	help: string;
	id: string;
	scope?: RuleScope;
	severity: Severity;
}

export interface RuleContext {
	filePath: string;
	report(diagnostic: Omit<Diagnostic, "rule" | "category" | "severity">): void;
	sourceFile: SourceFile;
}

export interface ProjectRuleContext {
	config: NestjsDoctorConfig;
	files: string[];
	moduleGraph: ModuleGraph;
	project: Project;
	providers: Map<string, ProviderInfo>;
	report(diagnostic: Omit<Diagnostic, "rule" | "category" | "severity">): void;
}

export interface Rule {
	check(context: RuleContext): void;
	meta: RuleMeta;
}

export interface ProjectRule {
	check(context: ProjectRuleContext): void;
	meta: RuleMeta;
}

export type AnyRule = Rule | ProjectRule;

export function isProjectRule(rule: AnyRule): rule is ProjectRule {
	return rule.meta.scope === "project";
}
