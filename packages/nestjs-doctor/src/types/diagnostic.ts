import type { RuleScope } from "../rules/types.js";

export type Severity = "error" | "warning" | "info";
export type Category =
	| "security"
	| "performance"
	| "correctness"
	| "architecture";

export interface SourceLine {
	line: number;
	text: string;
}

export interface Diagnostic {
	category: Category;
	column: number;
	filePath: string;
	help: string;
	line: number;
	message: string;
	rule: string;
	scope?: RuleScope;
	severity: Severity;
	sourceLines?: SourceLine[];
}
