import type { ClassDeclaration, MethodDeclaration } from "ts-morph";
import { isController, isHttpHandler } from "../../../nest-class-inspector.js";
import type { GuardFacts, Rule } from "../../types.js";

const PUBLIC_DECORATORS = new Set([
	"Public",
	"AllowAnonymous",
	"SkipAuth",
	"IsPublic",
]);

/** True for `@UseGuards()` or a decorator known to compose it. */
function hasGuard(
	node: ClassDeclaration | MethodDeclaration,
	guards: GuardFacts | undefined
): boolean {
	return node
		.getDecorators()
		.some(
			(decorator) =>
				decorator.getName() === "UseGuards" ||
				guards?.composedDecorators.has(decorator.getName())
		);
}

export const requireGuardsOnEndpoints: Rule = {
	meta: {
		id: "security/require-guards-on-endpoints",
		category: "security",
		severity: "warning",
		description:
			"Controller endpoints should be protected by @UseGuards() at class or method level",
		help: "Add @UseGuards(AuthGuard) to the controller class or individual route handlers, or mark routes as @Public(). A guard bound through APP_GUARD, or applied by a decorator built with applyDecorators(UseGuards(...)), already counts — but only when the token is written as APP_GUARD, not through an aliased import.",
	},

	check(context) {
		if (context.guards?.globallyRegistered) {
			return;
		}

		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			if (hasGuard(cls, context.guards)) {
				continue;
			}

			// Check for class-level @Public() or similar decorators
			const isClassPublic = cls
				.getDecorators()
				.some((d) => PUBLIC_DECORATORS.has(d.getName()));
			if (isClassPublic) {
				continue;
			}

			for (const method of cls.getMethods()) {
				if (!isHttpHandler(method)) {
					continue;
				}

				if (hasGuard(method, context.guards)) {
					continue;
				}

				// Check for @Public() or similar decorators
				const isPublic = method
					.getDecorators()
					.some((d) => PUBLIC_DECORATORS.has(d.getName()));
				if (isPublic) {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `Endpoint '${method.getName()}' has no @UseGuards() at class or method level.`,
					help: this.meta.help,
					line: method.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
