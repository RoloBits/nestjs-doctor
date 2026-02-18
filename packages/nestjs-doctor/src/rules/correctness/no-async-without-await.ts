import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noAsyncWithoutAwait: Rule = {
	meta: {
		id: "correctness/no-async-without-await",
		category: "correctness",
		severity: "warning",
		description:
			"Async functions/methods should contain at least one await expression",
		help: "Either add an await expression or remove the async keyword.",
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

				// Exclude nested async functions/arrow functions
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
						message: `Async method '${method.getName()}()' has no await expression.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}

		// Check standalone functions
		for (const fn of context.sourceFile.getFunctions()) {
			if (!fn.isAsync()) {
				continue;
			}

			const body = fn.getBody();
			if (!body) {
				continue;
			}

			const awaitExpressions = body.getDescendantsOfKind(
				SyntaxKind.AwaitExpression
			);

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
					message: `Async function '${fn.getName() ?? "anonymous"}()' has no await expression.`,
					help: this.meta.help,
					line: fn.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
