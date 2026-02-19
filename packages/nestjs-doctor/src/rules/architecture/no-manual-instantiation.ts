import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const DI_ONLY_SUFFIXES = ["Service", "Repository", "Gateway", "Resolver"];
const CONTEXT_AWARE_SUFFIXES = ["Guard", "Interceptor", "Pipe", "Filter"];

export const noManualInstantiation: Rule = {
	meta: {
		id: "architecture/no-manual-instantiation",
		category: "architecture",
		severity: "error",
		description:
			"Do not manually instantiate @Injectable classes — use NestJS dependency injection",
		help: "Register the class as a provider in a module and inject it via the constructor.",
	},

	check(context) {
		const newExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.NewExpression
		);

		for (const expr of newExpressions) {
			const exprText = expr.getExpression().getText();

			const isDiOnly = DI_ONLY_SUFFIXES.some((s) => exprText.endsWith(s));
			const isContextAware = CONTEXT_AWARE_SUFFIXES.some((s) =>
				exprText.endsWith(s)
			);

			if (!(isDiOnly || isContextAware)) {
				continue;
			}

			if (isContextAware) {
				// Skip if inside a decorator argument (e.g. @UseGuards(new AuthGuard()))
				if (expr.getFirstAncestorByKind(SyntaxKind.Decorator)) {
					continue;
				}

				// Only flag if inside a method body or constructor body
				const inMethod = expr.getFirstAncestorByKind(
					SyntaxKind.MethodDeclaration
				);
				const inConstructor = expr.getFirstAncestorByKind(
					SyntaxKind.Constructor
				);

				if (!(inMethod || inConstructor)) {
					continue;
				}
			}

			context.report({
				filePath: context.filePath,
				message: `Manual instantiation of '${exprText}' detected. Use dependency injection instead.`,
				help: this.meta.help,
				line: expr.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
