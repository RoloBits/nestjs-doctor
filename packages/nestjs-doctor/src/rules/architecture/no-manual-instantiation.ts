import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noManualInstantiation: Rule = {
	meta: {
		id: "architecture/no-manual-instantiation",
		category: "architecture",
		severity: "error",
		description:
			"Do not manually instantiate @Injectable classes — use NestJS dependency injection",
		help: "Register the class as a provider in a module and inject it via the constructor.",
	},

	check(context) {
		const newExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.NewExpression
		);

		for (const expr of newExpressions) {
			const exprText = expr.getExpression().getText();

			// Check if the instantiated class name follows NestJS service patterns
			if (
				exprText.endsWith("Service") ||
				exprText.endsWith("Repository") ||
				exprText.endsWith("Guard") ||
				exprText.endsWith("Interceptor") ||
				exprText.endsWith("Pipe") ||
				exprText.endsWith("Filter") ||
				exprText.endsWith("Gateway") ||
				exprText.endsWith("Resolver")
			) {
				context.report({
					filePath: context.filePath,
					message: `Manual instantiation of '${exprText}' detected. Use dependency injection instead.`,
					help: this.meta.help,
					line: expr.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
