import type { SourceFile } from "ts-morph";
import type { Category, Diagnostic, Severity } from "../types/diagnostic.js";

export type RuleScope = "file" | "project";

export interface RuleMeta {
	id: string;
	category: Category;
	severity: Severity;
	description: string;
	help: string;
}

export interface RuleContext {
	sourceFile: SourceFile;
	filePath: string;
	report(diagnostic: Omit<Diagnostic, "rule" | "category" | "severity">): void;
}

export interface Rule {
	meta: RuleMeta;
	check(context: RuleContext): void;
}
