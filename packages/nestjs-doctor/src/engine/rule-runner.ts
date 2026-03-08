import type { Project } from "ts-morph";
import type {
	AnyRule,
	CodeRuleContext,
	ProjectRule,
	ProjectRuleContext,
	Rule,
	SchemaRule,
	SchemaRuleContext,
} from "../rules/types.js";
import { isProjectRule, isSchemaRule } from "../rules/types.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
	SourceLine,
} from "../types/diagnostic.js";
import type { SchemaGraph } from "../types/schema.js";
import type { ModuleGraph } from "./module-graph.js";
import type { ProviderInfo } from "./type-resolver.js";

interface RuleError {
	error: unknown;
	ruleId: string;
}

interface RunRulesResult {
	diagnostics: Diagnostic[];
	errors: RuleError[];
}

export interface RunRulesOptions {
	config: NestjsDoctorConfig;
	moduleGraph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
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

function runFileRulesOnFile(
	project: Project,
	filePath: string,
	rules: Rule[],
	config?: NestjsDoctorConfig
): RunRulesResult {
	const diagnostics: CodeDiagnostic[] = [];
	const errors: RuleError[] = [];

	const sourceFile = project.getSourceFile(filePath);
	if (!sourceFile) {
		return { diagnostics, errors };
	}

	const fullText = sourceFile.getFullText();
	const allLines = fullText.split("\n");

	for (const rule of rules) {
		const context: CodeRuleContext = {
			config,
			sourceFile,
			filePath,
			report(partial) {
				const sourceLines: SourceLine[] = [];
				const start = Math.max(0, partial.line - 6);
				const end = Math.min(allLines.length, partial.line + 5);
				for (let i = start; i < end; i++) {
					sourceLines.push({ line: i + 1, text: allLines[i] });
				}
				diagnostics.push({
					...partial,
					rule: rule.meta.id,
					category: rule.meta.category,
					scope: "file",
					severity: rule.meta.severity,
					sourceLines,
				});
			},
		};

		try {
			rule.check(context);
		} catch (error) {
			errors.push({ ruleId: rule.meta.id, error });
		}
	}

	return { diagnostics, errors };
}

export function runFileRules(
	project: Project,
	files: string[],
	rules: Rule[],
	config?: NestjsDoctorConfig
): RunRulesResult {
	const diagnostics: Diagnostic[] = [];
	const errors: RuleError[] = [];

	for (const filePath of files) {
		const result = runFileRulesOnFile(project, filePath, rules, config);
		diagnostics.push(...result.diagnostics);
		errors.push(...result.errors);
	}

	return { diagnostics, errors };
}

export function runProjectRules(
	project: Project,
	files: string[],
	rules: ProjectRule[],
	options: RunRulesOptions
): RunRulesResult {
	const diagnostics: CodeDiagnostic[] = [];
	const errors: RuleError[] = [];

	for (const rule of rules) {
		const context: ProjectRuleContext = {
			project,
			files,
			moduleGraph: options.moduleGraph,
			providers: options.providers,
			config: options.config,
			report(partial) {
				diagnostics.push({
					...partial,
					rule: rule.meta.id,
					category: rule.meta.category,
					scope: "project",
					severity: rule.meta.severity,
				});
			},
		};

		try {
			rule.check(context);
		} catch (error) {
			errors.push({ ruleId: rule.meta.id, error });
		}
	}

	return { diagnostics, errors };
}

export function runSchemaRules(
	schemaGraph: SchemaGraph,
	rules: SchemaRule[]
): RunRulesResult {
	const diagnostics: SchemaDiagnostic[] = [];
	const errors: RuleError[] = [];

	for (const rule of rules) {
		const context: SchemaRuleContext = {
			schemaGraph,
			orm: schemaGraph.orm,
			report(partial) {
				diagnostics.push({
					...partial,
					rule: rule.meta.id,
					category: rule.meta.category,
					scope: "schema",
					severity: rule.meta.severity,
				});
			},
		};

		try {
			rule.check(context);
		} catch (error) {
			errors.push({ ruleId: rule.meta.id, error });
		}
	}

	return { diagnostics, errors };
}

export function runRules(
	project: Project,
	files: string[],
	rules: AnyRule[],
	options: RunRulesOptions
): RunRulesResult {
	const { fileRules, projectRules } = separateRules(rules);

	const fileResult = runFileRules(project, files, fileRules, options.config);
	const projectResult = runProjectRules(project, files, projectRules, options);

	return {
		diagnostics: [...fileResult.diagnostics, ...projectResult.diagnostics],
		errors: [...fileResult.errors, ...projectResult.errors],
	};
}
