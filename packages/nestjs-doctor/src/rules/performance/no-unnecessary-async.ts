import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noUnnecessaryAsync: Rule = {
	meta: {
		id: "performance/no-unnecessary-async",
		category: "performance",
		severity: "info",
		description:
			"Async functions without await add unnecessary promise wrapping overhead",
		help: "Remove the async keyword or add await if async behavior is needed.",
	},

	check(context) {
		// Check class methods
		for (const cls of context.sourceFile.getClasses()) {
			for (const method of cls.getMethods()) {
				if (!method.isAsync()) {
					continue;
				}

				const body = method.getBody();
				if (!body) {
					continue;
				}

				const awaitExpressions = body.getDescendantsOfKind(
					SyntaxKind.AwaitExpression
				);

				// Only count awaits directly in this function, not nested
				const directAwaits = awaitExpressions.filter((expr) => {
					let parent = expr.getParent();
					while (parent && parent !== body) {
						if (
							parent.getKind() === SyntaxKind.ArrowFunction ||
							parent.getKind() === SyntaxKind.FunctionExpression ||
							parent.getKind() === SyntaxKind.FunctionDeclaration
						) {
							return false;
						}
						parent = parent.getParent();
					}
					return true;
				});

				if (directAwaits.length === 0) {
					context.report({
						filePath: context.filePath,
						message: `Async method '${method.getName()}()' contains no await — unnecessary promise wrapping.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
