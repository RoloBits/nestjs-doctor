import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noRequestScopeAbuse: Rule = {
	meta: {
		id: "performance/no-request-scope-abuse",
		category: "performance",
		severity: "warning",
		description:
			"Scope.REQUEST creates a new provider instance per request — use only when necessary",
		help: "Remove Scope.REQUEST unless the provider genuinely needs per-request state (e.g., request-scoped context). Consider Scope.DEFAULT or Scope.TRANSIENT instead.",
	},

	check(context) {
		const propertyAccesses = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAccessExpression
		);

		for (const access of propertyAccesses) {
			if (access.getName() !== "REQUEST") {
				continue;
			}

			const objectText = access.getExpression().getText();
			if (objectText !== "Scope") {
				continue;
			}

			context.report({
				filePath: context.filePath,
				message:
					"Scope.REQUEST creates a new instance per request, which impacts performance and propagates request scope to all dependents.",
				help: this.meta.help,
				line: access.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
