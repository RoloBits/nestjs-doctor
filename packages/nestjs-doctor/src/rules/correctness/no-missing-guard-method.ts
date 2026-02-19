import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noMissingGuardMethod: Rule = {
	meta: {
		id: "correctness/no-missing-guard-method",
		category: "correctness",
		severity: "error",
		description: "Guard classes must implement the canActivate() method",
		help: "Add a canActivate(context: ExecutionContext) method to the guard class.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			const name = cls.getName() ?? "";
			if (!name.endsWith("Guard")) {
				continue;
			}
			if (!hasDecorator(cls, "Injectable")) {
				continue;
			}
			if (cls.getExtends()) {
				continue;
			}

			const hasCanActivate = cls
				.getMethods()
				.some((m) => m.getName() === "canActivate");
			if (!hasCanActivate) {
				context.report({
					filePath: context.filePath,
					message: `Guard '${name}' is missing the 'canActivate()' method.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
