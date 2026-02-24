import type { Project } from "ts-morph";
import type {
	AnyRule,
	ProjectRule,
	ProjectRuleContext,
	Rule,
	RuleContext,
} from "../rules/types.js";
import { isProjectRule } from "../rules/types.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { Diagnostic, SourceLine } from "../types/diagnostic.js";
import type { ModuleGraph } from "./module-graph.js";
import type { ProviderInfo } from "./type-resolver.js";

export interface RuleError {
	error: unknown;
	ruleId: string;
}

export interface RunRulesResult {
	diagnostics: Diagnostic[];
	errors: RuleError[];
}

export interface RunRulesOptions {
	config: NestjsDoctorConfig;
	moduleGraph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
}

export function runRules(
	project: Project,
	files: string[],
	rules: AnyRule[],
	options: RunRulesOptions
): RunRulesResult {
	const diagnostics: Diagnostic[] = [];
	const errors: RuleError[] = [];

	const fileRules: Rule[] = [];
	const projectRules: ProjectRule[] = [];

	for (const rule of rules) {
		if (isProjectRule(rule)) {
			projectRules.push(rule);
		} else {
			fileRules.push(rule);
		}
	}

	// Run file-scoped rules
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		const fullText = sourceFile.getFullText();
		const allLines = fullText.split("\n");

		for (const rule of fileRules) {
			const context: RuleContext = {
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
	}

	// Run project-scoped rules
	for (const rule of projectRules) {
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
