import type { Project } from "ts-morph";
import type { Rule, RuleContext } from "../rules/types.js";
import type { Diagnostic } from "../types/diagnostic.js";

export function runRules(
	project: Project,
	files: string[],
	rules: Rule[],
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) continue;

		for (const rule of rules) {
			const context: RuleContext = {
				sourceFile,
				filePath,
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
			} catch {
				// Rule failed — skip silently for now
			}
		}
	}

	return diagnostics;
}
