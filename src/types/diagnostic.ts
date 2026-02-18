export type Severity = "error" | "warning" | "info";
export type Category =
	| "security"
	| "performance"
	| "correctness"
	| "architecture";

export interface Diagnostic {
	filePath: string;
	rule: string;
	severity: Severity;
	message: string;
	help: string;
	line: number;
	column: number;
	category: Category;
}
