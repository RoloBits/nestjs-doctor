import type { Project } from "ts-morph";
import type { NestjsDoctorConfig } from "../common/config.js";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
	SourceLine,
} from "../common/diagnostic.js";
import type { SchemaGraph } from "../common/schema.js";
import type { ModuleGraph } from "./graph/module-graph.js";
import type { ProviderInfo } from "./graph/type-resolver.js";
import type { DeclaredDependencies } from "./project-detector.js";
import type {
	CodeRuleContext,
	GuardFacts,
	ProjectRule,
	ProjectRuleContext,
	Rule,
	SchemaRule,
	SchemaRuleContext,
} from "./rules/types.js";

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
	dependencies: DeclaredDependencies;
	moduleGraph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
	targetPath: string;
}

/** Project-wide facts handed to file rules that need more than one file. */
export interface FileRuleFacts {
	diProviders?: ReadonlySet<string>;
	guards?: GuardFacts;
	moduleDirectories?: ReadonlySet<string>;
}

function runFileRulesOnFile(
	project: Project,
	filePath: string,
	rules: Rule[],
	config?: NestjsDoctorConfig,
	facts?: FileRuleFacts
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
			diProviders: facts?.diProviders,
			guards: facts?.guards,
			moduleDirectories: facts?.moduleDirectories,
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
					...(Array.isArray(rule.meta.tags)
						? { tags: [...rule.meta.tags] }
						: {}),
					...(Array.isArray(rule.meta.surfaces)
						? { surfaces: [...rule.meta.surfaces] }
						: {}),
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
	config?: NestjsDoctorConfig,
	facts?: FileRuleFacts
): RunRulesResult {
	const diagnostics: Diagnostic[] = [];
	const errors: RuleError[] = [];

	for (const filePath of files) {
		const result = runFileRulesOnFile(project, filePath, rules, config, facts);
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
			dependencies: options.dependencies,
			targetPath: options.targetPath,
			report(partial) {
				diagnostics.push({
					...partial,
					rule: rule.meta.id,
					category: rule.meta.category,
					scope: "project",
					severity: rule.meta.severity,
					...(Array.isArray(rule.meta.tags)
						? { tags: [...rule.meta.tags] }
						: {}),
					...(Array.isArray(rule.meta.surfaces)
						? { surfaces: [...rule.meta.surfaces] }
						: {}),
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
					...(Array.isArray(rule.meta.tags)
						? { tags: [...rule.meta.tags] }
						: {}),
					...(Array.isArray(rule.meta.surfaces)
						? { surfaces: [...rule.meta.surfaces] }
						: {}),
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
