import type { RuleScope } from "../rules/types.js";

export type Severity = "error" | "warning" | "info";
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
