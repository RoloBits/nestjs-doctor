import { SyntaxKind } from "ts-morph";
import { isModule } from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

export const factoryInjectMatchesParams: Rule = {
	meta: {
		id: "correctness/factory-inject-matches-params",
		category: "correctness",
		severity: "error",
		tags: ["module-graph"],
		description:
			"useFactory inject array length must match the factory function parameter count",
		help: "Ensure the 'inject' array has one entry per factory function parameter.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isModule(cls)) {
				continue;
			}

			const moduleDecorator = cls.getDecorator("Module");
			if (!moduleDecorator) {
				continue;
			}

			const args = moduleDecorator.getArguments()[0];
			if (!args || args.getKind() !== SyntaxKind.ObjectLiteralExpression) {
				continue;
			}

			const obj = args.asKind(SyntaxKind.ObjectLiteralExpression);
			if (!obj) {
				continue;
			}

			const providersProp = obj.getProperty("providers");
			if (!providersProp) {
				continue;
			}

			const providersArray = providersProp.getChildrenOfKind(
				SyntaxKind.ArrayLiteralExpression
			)[0];
			if (!providersArray) {
				continue;
			}

			for (const element of providersArray.getElements()) {
				if (element.getKind() !== SyntaxKind.ObjectLiteralExpression) {
					continue;
				}

				const providerObj = element.asKind(SyntaxKind.ObjectLiteralExpression);
				if (!providerObj) {
					continue;
				}

				const useFactoryProp = providerObj.getProperty("useFactory");
				const injectProp = providerObj.getProperty("inject");

				if (!(useFactoryProp && injectProp)) {
					continue;
				}

				// Count inject array elements
				const injectArray = injectProp.getChildrenOfKind(
					SyntaxKind.ArrayLiteralExpression
				)[0];
				if (!injectArray) {
					continue;
				}
				const injectCount = injectArray.getElements().length;

				// Count factory function parameters
				let paramCount: number | undefined;

				// Handle method shorthand: useFactory(dep) { ... }
				const methodDecl = useFactoryProp.asKind(SyntaxKind.MethodDeclaration);
				if (methodDecl) {
					paramCount = methodDecl.getParameters().length;
				} else {
					// Handle property assignment: useFactory: (dep) => ... or useFactory: function(dep) { ... }
					const factoryAssignment = useFactoryProp.asKind(
						SyntaxKind.PropertyAssignment
					);
					if (!factoryAssignment) {
						continue;
					}

					const initializer = factoryAssignment.getInitializer();
					if (!initializer) {
						continue;
					}

					if (initializer.getKind() === SyntaxKind.ArrowFunction) {
						paramCount = initializer
							.asKind(SyntaxKind.ArrowFunction)
							?.getParameters().length;
					} else if (initializer.getKind() === SyntaxKind.FunctionExpression) {
						paramCount = initializer
							.asKind(SyntaxKind.FunctionExpression)
							?.getParameters().length;
					}
				}

				if (paramCount === undefined) {
					continue;
				}

				if (injectCount !== paramCount) {
					context.report({
						filePath: context.filePath,
						message: `Factory has ${paramCount} parameter(s) but inject array has ${injectCount} element(s).`,
						help: this.meta.help,
						line: element.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
