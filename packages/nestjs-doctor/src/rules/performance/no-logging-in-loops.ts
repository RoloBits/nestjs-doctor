import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const LOOP_KINDS = new Set([
	SyntaxKind.ForStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
]);

const CONSOLE_METHODS = new Set([
	"log",
	"warn",
	"error",
	"info",
	"debug",
	"trace",
]);

export const noLoggingInLoops: Rule = {
	meta: {
		id: "performance/no-logging-in-loops",
		category: "performance",
		severity: "info",
		description:
			"Logging inside loops can degrade performance and flood log output",
		help: "Move logging outside the loop, aggregate results, or use conditional logging.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const exprText = call.getExpression().getText();

			// Check for console.log/warn/error etc.
			const isConsoleCall =
				exprText.startsWith("console.") &&
				CONSOLE_METHODS.has(exprText.split(".")[1]);

			// Check for this.logger.log/warn/error etc.
			const isLoggerCall =
				exprText.startsWith("this.logger.") &&
				CONSOLE_METHODS.has(exprText.split(".")[2]);

			if (!(isConsoleCall || isLoggerCall)) {
				continue;
			}

			// Check if inside a loop
			let parent = call.getParent();
			while (parent) {
				if (LOOP_KINDS.has(parent.getKind())) {
					context.report({
						filePath: context.filePath,
						message: `Logging call '${exprText}()' inside a loop.`,
						help: this.meta.help,
						line: call.getStartLineNumber(),
						column: 1,
					});
					break;
				}
				parent = parent.getParent();
			}
		}
	},
};
