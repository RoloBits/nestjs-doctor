import type { RuleScope } from "./rule-scope.js";

export type Severity = "error" | "warning" | "info";

/**
 * Where a diagnostic is allowed to appear. A rule can be reported without
 * moving the score or failing a build.
 */
export type DiagnosticSurface = "cli" | "prComment" | "score" | "ciFailure";

export type Category =
	| "security"
	| "performance"
	| "correctness"
	| "architecture"
	| "schema";

export interface SourceLine {
	line: number;
	text: string;
}

export interface BaseDiagnostic {
	category: Category;
	filePath: string;
	help: string;
	message: string;
	rule: string;
	scope?: RuleScope;
	severity: Severity;
	/** Absent means every surface. */
	surfaces?: DiagnosticSurface[];
	/** The emitting rule's `meta.tags`, when it declares any. */
	tags?: string[];
}

export interface CodeDiagnostic extends BaseDiagnostic {
	column: number;
	line: number;
	sourceLines?: SourceLine[];
}

export interface SchemaDiagnostic extends BaseDiagnostic {
	entity: string;
	schemaColumn?: string;
}

export type Diagnostic = CodeDiagnostic | SchemaDiagnostic;

export function isCodeDiagnostic(d: Diagnostic): d is CodeDiagnostic {
	return "line" in d;
}

export function isSchemaDiagnostic(d: Diagnostic): d is SchemaDiagnostic {
	return "entity" in d;
}

/** Absent surfaces mean the diagnostic appears everywhere. */
export const onSurface = (
	diagnostic: BaseDiagnostic,
	surface: DiagnosticSurface
): boolean => diagnostic.surfaces?.includes(surface) ?? true;

/** The diagnostics a surface is allowed to show. */
export const forSurface = <T extends BaseDiagnostic>(
	diagnostics: T[],
	surface: DiagnosticSurface
): T[] => diagnostics.filter((diagnostic) => onSurface(diagnostic, surface));
