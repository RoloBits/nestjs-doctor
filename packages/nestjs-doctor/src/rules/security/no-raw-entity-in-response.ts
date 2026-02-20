import { isController, isHttpHandler } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const ENTITY_SUFFIXES = ["Entity", "Model"];
const ENTITY_PATTERN = new RegExp(
	`(?:^|[^a-zA-Z])\\w*(?:${ENTITY_SUFFIXES.join("|")})(?:[^a-zA-Z]|$)`
);

export const noRawEntityInResponse: Rule = {
	meta: {
		id: "security/no-raw-entity-in-response",
		category: "security",
		severity: "warning",
		description:
			"Returning ORM entities directly from controllers can leak internal fields like passwords or IDs",
		help: "Map entities to DTOs or use class-transformer's @Exclude()/@Expose() decorators before returning. This rule detects classes with Entity/Model suffix in return types.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			for (const method of cls.getMethods()) {
				if (!isHttpHandler(method)) {
					continue;
				}

				const returnType = method.getReturnType().getText();

				if (
					ENTITY_PATTERN.test(returnType) &&
					!returnType.includes("DTO") &&
					!returnType.includes("Dto") &&
					!returnType.includes("Response")
				) {
					context.report({
						filePath: context.filePath,
						message: `Controller method '${method.getName()}' returns a raw entity type. This may leak internal fields.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
