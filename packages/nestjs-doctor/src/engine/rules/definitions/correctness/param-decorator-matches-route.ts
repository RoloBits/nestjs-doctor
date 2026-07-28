import { type Node, SyntaxKind } from "ts-morph";
import {
	declaresRoutes,
	HTTP_DECORATORS,
} from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

const ROUTE_PARAM_REGEX = /:(\w+)/g;

const QUOTED = /^['"`][^'"`]*['"`]$/;

/** The literal text of a route argument, or undefined when it is computed. */
function asStringLiteral(node: Node): string | undefined {
	const text = node.getText();
	return QUOTED.test(text) ? text.slice(1, -1) : undefined;
}

export const paramDecoratorMatchesRoute: Rule = {
	meta: {
		id: "correctness/param-decorator-matches-route",
		category: "correctness",
		severity: "error",
		description:
			"@Param() decorator name must match a :param in the route path",
		help: "Ensure the @Param('name') argument matches a ':name' segment in the route path (including controller prefix).",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!declaresRoutes(cls)) {
				continue;
			}

			// Extract controller-level prefix params
			const controllerDecorator = cls.getDecorator("Controller");
			let controllerPath = "";
			let controllerPathIsReadable = true;
			if (controllerDecorator) {
				const args = controllerDecorator.getArguments();
				if (args.length > 0) {
					const firstArg = args[0];
					if (firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
						// @Controller({ path: 'users/:id', host: '...' }) — extract only the path property
						const obj = firstArg.asKind(SyntaxKind.ObjectLiteralExpression);
						if (obj) {
							const pathProp = obj.getProperty("path");
							if (pathProp) {
								const assignment = pathProp.asKind(
									SyntaxKind.PropertyAssignment
								);
								if (assignment) {
									const initializer = assignment.getInitializer();
									if (initializer) {
										controllerPath = initializer
											.getText()
											.replace(/^['"`]|['"`]$/g, "");
									}
								}
							}
						}
					} else {
						const literal = asStringLiteral(firstArg);
						controllerPathIsReadable = literal !== undefined;
						controllerPath = literal ?? "";
					}
				}
			}

			const controllerParams = new Set<string>();
			for (const match of controllerPath.matchAll(ROUTE_PARAM_REGEX)) {
				controllerParams.add(match[1]);
			}

			for (const method of cls.getMethods()) {
				// Find the HTTP decorator and its route path
				let routePath = "";
				let isHttpMethod = false;
				let pathIsReadable = true;
				for (const decorator of method.getDecorators()) {
					if (HTTP_DECORATORS.has(decorator.getName())) {
						isHttpMethod = true;
						const args = decorator.getArguments();
						if (args.length > 0) {
							const literal = asStringLiteral(args[0]);
							pathIsReadable = literal !== undefined;
							routePath = literal ?? "";
						}
						break;
					}
				}

				// A path built from a constant cannot be read, so its parameters
				// are unknown and nothing here can be called a mismatch.
				if (!(isHttpMethod && pathIsReadable && controllerPathIsReadable)) {
					continue;
				}

				// Collect route param names from the method route path
				const methodParams = new Set<string>();
				for (const match of routePath.matchAll(ROUTE_PARAM_REGEX)) {
					methodParams.add(match[1]);
				}

				// Combine controller + method params
				const allRouteParams = new Set([...controllerParams, ...methodParams]);

				// Check each @Param() decorator on method parameters
				for (const param of method.getParameters()) {
					for (const decorator of param.getDecorators()) {
						if (decorator.getName() !== "Param") {
							continue;
						}

						const args = decorator.getArguments();
						if (args.length === 0) {
							// @Param() without arguments grabs all params — skip
							continue;
						}

						const paramName = args[0].getText().replace(/^['"`]|['"`]$/g, "");

						if (!allRouteParams.has(paramName)) {
							context.report({
								filePath: context.filePath,
								message: `@Param('${paramName}') does not match any route parameter. Available: ${allRouteParams.size > 0 ? [...allRouteParams].map((p) => `:${p}`).join(", ") : "(none)"}.`,
								help: this.meta.help,
								line: decorator.getStartLineNumber(),
								column: 1,
							});
						}
					}
				}
			}
		}
	},
};
