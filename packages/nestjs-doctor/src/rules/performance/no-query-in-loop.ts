import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const LOOP_KINDS = new Set([
	SyntaxKind.ForStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
]);

export const noQueryInLoop: Rule = {
	meta: {
		id: "performance/no-query-in-loop",
		category: "performance",
		severity: "warning",
		description:
			"Await expressions inside loops cause N+1 query patterns — batch or parallelize instead",
		help: "Use Promise.all(), batch queries, or database-level operations (e.g., WHERE IN) instead of awaiting in a loop.",
	},

	check(context) {
		const awaitExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.AwaitExpression
		);

		for (const awaitExpr of awaitExpressions) {
			let parent = awaitExpr.getParent();
			while (parent) {
				if (LOOP_KINDS.has(parent.getKind())) {
					context.report({
						filePath: context.filePath,
						message:
							"Await expression inside a loop — potential N+1 query pattern.",
						help: this.meta.help,
						line: awaitExpr.getStartLineNumber(),
						column: 1,
					});
					break;
				}
				parent = parent.getParent();
			}
		}
	},
};
