import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noMissingFilterCatch: Rule = {
	meta: {
		id: "correctness/no-missing-filter-catch",
		category: "correctness",
		severity: "error",
		description:
			"Exception filter classes decorated with @Catch() must implement the catch() method",
		help: "Add a catch(exception, host: ArgumentsHost) method to the filter class.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!hasDecorator(cls, "Catch")) {
				continue;
			}
			if (cls.getExtends()) {
				continue;
			}

			const hasCatchMethod = cls
				.getMethods()
				.some((m) => m.getName() === "catch");
			if (!hasCatchMethod) {
				context.report({
					filePath: context.filePath,
					message: `Exception filter '${cls.getName()}' has @Catch() but is missing the 'catch()' method.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
