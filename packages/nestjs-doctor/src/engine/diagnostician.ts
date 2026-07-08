import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { type SourceFile, SyntaxKind } from "ts-morph";
import type { Diagnostic } from "../common/diagnostic.js";
import type { RuleErrorInfo } from "../common/result.js";
import type { AnalysisContext } from "./analysis-context.js";
import { filterIgnoredDiagnostics } from "./filter-diagnostics.js";
import { filterSuppressedDiagnostics } from "./inline-suppressions.js";
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

// Prisma `.prisma` schemas live outside the ts-morph AST project.
const NON_AST_SOURCE_EXTENSIONS = [".prisma"];
// Cheap gate: skip string-blanking for files that mention no directive.
const SUPPRESSION_MARKER = "nestjs-doctor-";
const NON_NEWLINE_RE = /[^\n]/g;
// A double-quoted Prisma string, backslash escapes included.
const PRISMA_STRING_RE = /"(?:\\.|[^"\\])*"/g;
// Literal kinds whose contents get blanked so their text can't look like a directive.
const STRING_LIKE_KINDS = new Set<SyntaxKind>([
	SyntaxKind.StringLiteral,
	SyntaxKind.NoSubstitutionTemplateLiteral,
	SyntaxKind.TemplateHead,
	SyntaxKind.TemplateMiddle,
	SyntaxKind.TemplateTail,
	SyntaxKind.RegularExpressionLiteral,
]);

// Blank string/template/regex-literal contents (newlines kept) so a directive only counts inside a real comment, never inside a string.
function blankStringLiterals(sourceFile: SourceFile): string {
	const full = sourceFile.getFullText();
	const spans = sourceFile
		.getDescendants()
		.filter((node) => STRING_LIKE_KINDS.has(node.getKind()))
		.map((node) => [node.getStart(), node.getEnd()] as const)
		.sort((a, b) => a[0] - b[0]);

	let result = "";
	let cursor = 0;
	for (const [start, end] of spans) {
		if (start < cursor) {
			continue;
		}
		result += full.slice(cursor, start);
		result += full.slice(start, end).replace(NON_NEWLINE_RE, " ");
		cursor = end;
	}
	return result + full.slice(cursor);
}

const blankPrismaStrings = (text: string): string =>
	text.replace(PRISMA_STRING_RE, (match) => match.replace(NON_NEWLINE_RE, " "));

// TS source comes from the AST project; `.prisma` is read from disk so its
// `-file` directives resolve too. String contents are blanked before parsing.
function resolveSourceText(
	context: AnalysisContext,
	filePath: string
): string | undefined {
	const sourceFile = context.astProject.getSourceFile(filePath);
	if (sourceFile) {
		const text = sourceFile.getFullText();
		return text.includes(SUPPRESSION_MARKER)
			? blankStringLiterals(sourceFile)
			: text;
	}
	if (NON_AST_SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
		try {
			const raw = readFileSync(filePath, "utf8");
			return raw.includes(SUPPRESSION_MARKER) ? blankPrismaStrings(raw) : raw;
		} catch {
			return;
		}
	}
	return;
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
	const configFiltered = filterIgnoredDiagnostics(
		rawDiagnostics,
		context.config,
		context.targetPath
	);
	const diagnostics = filterSuppressedDiagnostics(configFiltered, (filePath) =>
		resolveSourceText(context, filePath)
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
