import {
	hasGuardDecorator,
	PUBLIC_DECORATORS,
} from "../../../graph/guard-facts.js";
import {
	declaresRoutes,
	isController,
	isHttpHandler,
} from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

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
			if (!declaresRoutes(cls)) {
				continue;
			}

			if (
				hasGuardDecorator(cls, context.guards?.composedDecorators ?? new Set())
			) {
				continue;
			}

			// A base class carries handlers but no @Controller(); the subclass that
			// registers it may be where the guard lives.
			const name = cls.getName();
			if (
				!isController(cls) &&
				name &&
				context.guards?.guardedBaseClasses.has(name)
			) {
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

				if (
					hasGuardDecorator(
						method,
						context.guards?.composedDecorators ?? new Set()
					)
				) {
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
