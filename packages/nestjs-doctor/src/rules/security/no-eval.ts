import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noEval: Rule = {
	meta: {
		id: "security/no-eval",
		category: "security",
		severity: "error",
		description:
			"Usage of eval() or new Function() is a security risk and should be avoided",
		help: "Refactor to avoid eval() and new Function(). Use safer alternatives like JSON.parse() or a sandboxed interpreter.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const exprText = call.getExpression().getText();
			if (exprText === "eval") {
				context.report({
					filePath: context.filePath,
					message: "Usage of eval() is a security risk.",
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
			}
		}

		// Check for new Function()
		const newExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.NewExpression
		);

		for (const expr of newExpressions) {
			if (expr.getExpression().getText() === "Function") {
				context.report({
					filePath: context.filePath,
					message: "Usage of new Function() is a security risk.",
					help: this.meta.help,
					line: expr.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
