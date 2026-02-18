import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const FIND_MANY_METHODS = new Set(["findMany", "find"]);
const PAGINATION_ARGS = new Set([
	"take",
	"skip",
	"limit",
	"offset",
	"page",
	"perPage",
	"pageSize",
]);

export const preferPagination: Rule = {
	meta: {
		id: "performance/prefer-pagination",
		category: "performance",
		severity: "info",
		description:
			"Database findMany/find queries should include pagination to avoid loading excessive data",
		help: "Add pagination arguments (take/skip, limit/offset) to the query.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const expr = call.getExpression();
			const methodName = expr.getText().split(".").pop() ?? "";

			if (!FIND_MANY_METHODS.has(methodName)) {
				continue;
			}

			const args = call.getArguments();

			// No args at all — no pagination
			if (args.length === 0) {
				context.report({
					filePath: context.filePath,
					message: `'${methodName}()' called without pagination arguments.`,
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
				continue;
			}

			// Check if object argument contains pagination keys
			const firstArg = args[0];
			if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
				continue;
			}

			const obj = firstArg.asKind(SyntaxKind.ObjectLiteralExpression);
			if (!obj) {
				continue;
			}

			const props = obj
				.getProperties()
				.map((p) => p.getText().split(":")[0].trim());
			const hasPagination = props.some((p) => PAGINATION_ARGS.has(p));

			if (!hasPagination) {
				context.report({
					filePath: context.filePath,
					message: `'${methodName}()' called without pagination arguments.`,
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
