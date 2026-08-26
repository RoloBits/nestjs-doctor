import { type Node, type SourceFile, SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

const DI_ONLY_SUFFIXES = ["Service", "Repository", "Gateway", "Resolver"];
const CONTEXT_AWARE_SUFFIXES = ["Guard", "Interceptor", "Pipe", "Filter"];
const DYNAMIC_MODULE_CALL = /\.(?:forRoot|forFeature|register)(?:Async)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function addNewExpressionStarts(node: Node, starts: Set<number>): void {
	const directExpression = node.asKind(SyntaxKind.NewExpression);
	if (directExpression) {
		starts.add(directExpression.getStart());
	}

	for (const expression of node.getDescendantsOfKind(
		SyntaxKind.NewExpression
	)) {
		starts.add(expression.getStart());
	}
}

function getProviderConstructionStarts(sourceFile: SourceFile): Set<number> {
	const starts = new Set<number>();

	for (const obj of sourceFile.getDescendantsOfKind(
		SyntaxKind.ObjectLiteralExpression
	)) {
		if (!obj.getProperty("provide")) {
			continue;
		}
		for (const key of ["useFactory", "useValue"]) {
			const prop = obj.getProperty(key);
			const construction =
				prop?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
				prop?.asKind(SyntaxKind.MethodDeclaration);
			if (construction) {
				addNewExpressionStarts(construction, starts);
			}
		}
	}

	for (const call of sourceFile.getDescendantsOfKind(
		SyntaxKind.CallExpression
	)) {
		if (!DYNAMIC_MODULE_CALL.test(call.getExpression().getText())) {
			continue;
		}
		for (const arg of call.getArguments()) {
			const literal =
				arg.asKind(SyntaxKind.ObjectLiteralExpression) ??
				arg.asKind(SyntaxKind.ArrayLiteralExpression);
			if (!literal) {
				continue;
			}
			addNewExpressionStarts(literal, starts);
		}
	}

	return starts;
}

function isRuntimeClassConstruction(node: Node): boolean {
	const member = node.getFirstAncestor((ancestor) =>
		[
			SyntaxKind.MethodDeclaration,
			SyntaxKind.Constructor,
			SyntaxKind.PropertyDeclaration,
			SyntaxKind.GetAccessor,
			SyntaxKind.SetAccessor,
		].includes(ancestor.getKind())
	);
	if (!member) {
		return false;
	}
	return !(
		member.asKind(SyntaxKind.MethodDeclaration)?.isStatic() ||
		member.asKind(SyntaxKind.PropertyDeclaration)?.isStatic() ||
		member.asKind(SyntaxKind.GetAccessor)?.isStatic() ||
		member.asKind(SyntaxKind.SetAccessor)?.isStatic()
	);
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
		tags: ["module-graph"],
		description:
			"Do not manually instantiate @Injectable classes — use NestJS dependency injection",
		help: "Register the class as a provider in a module and inject it via the constructor.",
	},

	check(context) {
		const excludedClasses = getExcludedClasses(
			context.config?.rules?.[this.meta.id]
		);
		const providerConstructionStarts = getProviderConstructionStarts(
			context.sourceFile
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

			if (providerConstructionStarts.has(expr.getStart())) {
				continue;
			}

			if (!isRuntimeClassConstruction(expr)) {
				continue;
			}

			// A name suffix is not a provider. Only a class NestJS instantiates can
			// be injected instead; a plain class, or one from node_modules, cannot.
			if (
				context.diProviders &&
				!(
					context.diProviders.has(exprText) ||
					context.diProviders.has(simpleExprText)
				)
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

			const decorator = expr.getFirstAncestorByKind(SyntaxKind.Decorator);
			if (decorator) {
				// Handing a pipe or guard to a decorator is the documented API.
				if (isContextAware) {
					continue;
				}
				// Configuration sits on a class or method; a parameter token
				// like @Inject(new UserService()) is still a bypass.
				if (decorator.getParent()?.getKind() !== SyntaxKind.Parameter) {
					continue;
				}
			}

			if (isContextAware) {
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
