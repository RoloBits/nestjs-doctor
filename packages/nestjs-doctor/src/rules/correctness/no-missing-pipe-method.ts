import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noMissingPipeMethod: Rule = {
	meta: {
		id: "correctness/no-missing-pipe-method",
		category: "correctness",
		severity: "error",
		description: "Pipe classes must implement the transform() method",
		help: "Add a transform(value: any, metadata: ArgumentMetadata) method to the pipe class.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			const name = cls.getName() ?? "";
			if (!name.endsWith("Pipe")) {
				continue;
			}
			if (!hasDecorator(cls, "Injectable")) {
				continue;
			}

			const hasTransform = cls
				.getMethods()
				.some((m) => m.getName() === "transform");
			if (!hasTransform) {
				context.report({
					filePath: context.filePath,
					message: `Pipe '${name}' is missing the 'transform()' method.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
