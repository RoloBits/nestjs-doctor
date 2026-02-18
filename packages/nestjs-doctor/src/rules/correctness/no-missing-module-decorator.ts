import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noMissingModuleDecorator: Rule = {
	meta: {
		id: "correctness/no-missing-module-decorator",
		category: "correctness",
		severity: "warning",
		description: "Classes named *Module should have a @Module() decorator",
		help: "Add @Module({}) decorator to the class, or rename it if it is not a NestJS module.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			const name = cls.getName() ?? "";
			if (!name.endsWith("Module")) {
				continue;
			}

			// Skip common non-NestJS module names
			if (name === "Module" || name === "DynamicModule") {
				continue;
			}

			if (!hasDecorator(cls, "Module")) {
				context.report({
					filePath: context.filePath,
					message: `Class '${name}' is named like a module but is missing the @Module() decorator.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
