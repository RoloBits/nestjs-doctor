import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noServiceLocator: Rule = {
	meta: {
		id: "architecture/no-service-locator",
		category: "architecture",
		severity: "warning",
		description:
			"Avoid using ModuleRef.get() or ModuleRef.resolve() — prefer explicit constructor injection",
		help: "Replace ModuleRef.get()/resolve() with constructor injection for explicit, testable dependencies.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const expr = call.getExpression();
			if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) {
				continue;
			}

			const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
			if (!propAccess) {
				continue;
			}

			const methodName = propAccess.getName();
			if (methodName !== "get" && methodName !== "resolve") {
				continue;
			}

			const objectText = propAccess.getExpression().getText();
			if (objectText === "moduleRef" || objectText === "this.moduleRef") {
				context.report({
					filePath: context.filePath,
					message: `Service locator pattern: '${objectText}.${methodName}()' hides dependencies. Use constructor injection instead.`,
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
