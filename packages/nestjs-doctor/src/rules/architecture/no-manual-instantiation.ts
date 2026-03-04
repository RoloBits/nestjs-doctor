import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const DI_ONLY_SUFFIXES = ["Service", "Repository", "Gateway", "Resolver"];
const CONTEXT_AWARE_SUFFIXES = ["Guard", "Interceptor", "Pipe", "Filter"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getExcludedClasses(ruleConfig: unknown): Set<string> {
	if (!isRecord(ruleConfig)) {
		return new Set();
	}

	const direct = ruleConfig.excludeClasses;
	if (Array.isArray(direct)) {
		return new Set(
			direct.filter((value): value is string => typeof value === "string")
		);
	}

	const options = ruleConfig.options;
	if (!isRecord(options)) {
		return new Set();
	}

	const fromOptions = options.excludeClasses;
	if (!Array.isArray(fromOptions)) {
		return new Set();
	}

	return new Set(
		fromOptions.filter((value): value is string => typeof value === "string")
	);
}

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
		const excludedClasses = getExcludedClasses(
			context.config?.rules?.[this.meta.id]
		);
		const newExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.NewExpression
		);

		for (const expr of newExpressions) {
			const exprText = expr.getExpression().getText();
			const simpleExprText = exprText.split(".").pop() ?? exprText;

			if (
				excludedClasses.has(exprText) ||
				excludedClasses.has(simpleExprText)
			) {
				continue;
			}

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
