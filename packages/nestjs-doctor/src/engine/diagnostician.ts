import { performance } from "node:perf_hooks";
import type { Diagnostic } from "../common/diagnostic.js";
import type { RuleErrorInfo } from "../common/result.js";
import type { AnalysisContext } from "./analysis-context.js";
import { filterIgnoredDiagnostics } from "./filter-diagnostics.js";
import {
	type RunRulesOptions,
	runFileRules,
	runProjectRules,
	runSchemaRules,
} from "./rule-runner.js";

function formatRuleError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export interface RawDiagnosticOutput {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	ruleErrors: RuleErrorInfo[];
}

function processResults(
	rawDiagnostics: Diagnostic[],
	errors: { ruleId: string; error: unknown }[],
	context: AnalysisContext
): { diagnostics: Diagnostic[]; errors: RuleErrorInfo[] } {
	const diagnostics = filterIgnoredDiagnostics(
		rawDiagnostics,
		context.config,
		context.targetPath
	);
	const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));
	return { diagnostics, errors: ruleErrors };
}

export function checkFile(
	context: AnalysisContext,
	filePath: string
): { diagnostics: Diagnostic[]; errors: RuleErrorInfo[] } {
	const result = runFileRules(
		context.astProject,
		[filePath],
		context.fileRules,
		context.config
	);
	return processResults(result.diagnostics, result.errors, context);
}

export function checkAllFiles(context: AnalysisContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	const result = runFileRules(
		context.astProject,
		context.files,
		context.fileRules,
		context.config
	);
	return processResults(result.diagnostics, result.errors, context);
}

export function checkProject(context: AnalysisContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	const options: RunRulesOptions = {
		moduleGraph: context.moduleGraph,
		providers: context.providers,
		config: context.config,
	};
	const result = runProjectRules(
		context.astProject,
		context.files,
		context.projectRules,
		options
	);
	const { diagnostics, errors } = processResults(
		result.diagnostics,
		result.errors,
		context
	);
	const schemaResult = checkSchema(context);
	diagnostics.push(...schemaResult.diagnostics);
	errors.push(...schemaResult.errors);

	return { diagnostics, errors };
}

export function checkSchema(context: AnalysisContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	if (!context.schemaGraph || context.schemaRules.length === 0) {
		return { diagnostics: [], errors: [] };
	}

	if (context.schemaGraph.entities.size === 0) {
		return { diagnostics: [], errors: [] };
	}

	const result = runSchemaRules(context.schemaGraph, context.schemaRules);
	return processResults(result.diagnostics, result.errors, context);
}

export function diagnose(context: AnalysisContext): RawDiagnosticOutput {
	const startTime = performance.now();
	const fileResult = checkAllFiles(context);
	const projectResult = checkProject(context);
	const elapsedMs = performance.now() - startTime;
	return {
		diagnostics: [...fileResult.diagnostics, ...projectResult.diagnostics],
		elapsedMs,
		ruleErrors: [...fileResult.errors, ...projectResult.errors],
	};
}
