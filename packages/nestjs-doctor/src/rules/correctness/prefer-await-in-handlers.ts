import { type Node, SyntaxKind } from "ts-morph";
import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const HTTP_DECORATORS = new Set([
	"Get",
	"Post",
	"Put",
	"Delete",
	"Patch",
	"All",
	"Head",
	"Options",
]);

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

export const preferAwaitInHandlers: Rule = {
	meta: {
		id: "correctness/prefer-await-in-handlers",
		category: "correctness",
		severity: "warning",
		description:
			"Async HTTP handler missing await — risks broken exception filters and lost stack traces",
		help: "Add await when calling services. This ensures exception filters trigger correctly, stack traces point to the handler, and error handling is consistent across handlers.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			for (const method of cls.getMethods()) {
				const hasHttpDecorator = method
					.getDecorators()
					.some((d) => HTTP_DECORATORS.has(d.getName()));

				if (!(hasHttpDecorator && method.isAsync())) {
					continue;
				}

				const body = method.getBody();
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
					const name = method.getName();
					if (returnsNewPromise(body)) {
						context.report({
							filePath: context.filePath,
							message: `Handler '${name}()' returns a Promise directly — remove async and return the promise, or await the resolved value.`,
							help: this.meta.help,
							line: method.getStartLineNumber(),
							column: 1,
						});
					} else {
						context.report({
							filePath: context.filePath,
							message: `Async handler '${name}()' does not await any expression.`,
							help: this.meta.help,
							line: method.getStartLineNumber(),
							column: 1,
						});
					}
				}
			}
		}
	},
};
