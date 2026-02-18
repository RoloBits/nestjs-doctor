import { isController, isService } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const preferConstructorInjection: Rule = {
	meta: {
		id: "architecture/prefer-constructor-injection",
		category: "architecture",
		severity: "warning",
		description:
			"Prefer constructor injection over @Inject() property injection",
		help: "Move the dependency to a constructor parameter instead of using property injection.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!(isService(cls) || isController(cls))) {
				continue;
			}

			for (const prop of cls.getProperties()) {
				const hasInjectDecorator = prop.getDecorator("Inject");
				if (!hasInjectDecorator) {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `Property '${prop.getName()}' uses @Inject() decorator. Prefer constructor injection.`,
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
