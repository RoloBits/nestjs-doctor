import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noDynamicRequire: Rule = {
	meta: {
		id: "performance/no-dynamic-require",
		category: "performance",
		severity: "warning",
		description:
			"Dynamic require() with variable arguments prevents bundler optimization",
		help: "Use static import statements or dynamic import() with string literals.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			if (call.getExpression().getText() !== "require") {
				continue;
			}

			const args = call.getArguments();
			if (args.length === 0) {
				continue;
			}

			const firstArg = args[0];
			// Allow string literals (static requires)
			if (firstArg.getKind() === SyntaxKind.StringLiteral) {
				continue;
			}

			context.report({
				filePath: context.filePath,
				message:
					"Dynamic require() with non-literal argument prevents bundler optimization.",
				help: this.meta.help,
				line: call.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
