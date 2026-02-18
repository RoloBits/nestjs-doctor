import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const RAW_QUERY_METHODS = new Set([
	"$executeRaw",
	"$queryRaw",
	"$executeRawUnsafe",
	"$queryRawUnsafe",
	"query",
]);

export const noUnsafeRawQuery: Rule = {
	meta: {
		id: "security/no-unsafe-raw-query",
		category: "security",
		severity: "error",
		description:
			"Raw SQL queries with template literal interpolation are a SQL injection risk",
		help: "Use parameterized queries or Prisma's tagged template (Prisma.sql`...`) instead of string interpolation.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const expr = call.getExpression();
			const methodName = expr.getText().split(".").pop() ?? "";

			if (!RAW_QUERY_METHODS.has(methodName)) {
				continue;
			}

			const args = call.getArguments();
			if (args.length === 0) {
				continue;
			}

			const firstArg = args[0];
			// Check for template literals with expressions (interpolation)
			if (firstArg.getKind() === SyntaxKind.TemplateExpression) {
				context.report({
					filePath: context.filePath,
					message: `Raw SQL query '${methodName}()' uses template literal interpolation — SQL injection risk.`,
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
