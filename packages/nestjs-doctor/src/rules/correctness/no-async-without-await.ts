import { type Node, SyntaxKind } from "ts-morph";
import { HTTP_DECORATORS, isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

function returnsNewPromise(body: Node): boolean {
	const returnStatements = body.getDescendantsOfKind(
		SyntaxKind.ReturnStatement
	);
	return returnStatements.some((ret) => {
		const expr = ret.getExpression();
		if (!expr || expr.getKind() !== SyntaxKind.NewExpression) {
			return false;
		}
		return (
			expr.asKindOrThrow(SyntaxKind.NewExpression).getExpression().getText() ===
			"Promise"
		);
	});
}

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

				// Skip controller HTTP handlers — covered by prefer-await-in-handlers
				if (isController(cls)) {
					const hasHttpDecorator = method
						.getDecorators()
						.some((d) => HTTP_DECORATORS.has(d.getName()));
					if (hasHttpDecorator) {
						continue;
					}
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
					const name = method.getName();
					if (returnsNewPromise(body)) {
						context.report({
							filePath: context.filePath,
							message: `Async method '${name}()' returns a Promise directly — remove the async keyword.`,
							help: "The async keyword is unnecessary when you are already constructing a Promise manually. Remove async to avoid double-wrapping.",
							line: method.getStartLineNumber(),
							column: 1,
						});
					} else {
						context.report({
							filePath: context.filePath,
							message: `Async method '${name}()' has no await expression.`,
							help: this.meta.help,
							line: method.getStartLineNumber(),
							column: 1,
						});
					}
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
				const name = fn.getName() ?? "anonymous";
				if (returnsNewPromise(body)) {
					context.report({
						filePath: context.filePath,
						message: `Async function '${name}()' returns a Promise directly — remove the async keyword.`,
						help: "The async keyword is unnecessary when you are already constructing a Promise manually. Remove async to avoid double-wrapping.",
						line: fn.getStartLineNumber(),
						column: 1,
					});
				} else {
					context.report({
						filePath: context.filePath,
						message: `Async function '${name}()' has no await expression.`,
						help: this.meta.help,
						line: fn.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
