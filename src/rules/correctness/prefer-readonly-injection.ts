import { isService, isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const preferReadonlyInjection: Rule = {
	meta: {
		id: "correctness/prefer-readonly-injection",
		category: "correctness",
		severity: "warning",
		description:
			"Constructor DI parameters should be readonly to prevent accidental reassignment",
		help: "Add the 'readonly' modifier to the constructor parameter.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isService(cls) && !isController(cls)) continue;

			const ctor = cls.getConstructors()[0];
			if (!ctor) continue;

			for (const param of ctor.getParameters()) {
				// Only check parameter properties (those with access modifiers)
				if (!param.hasModifier("private") &&
					!param.hasModifier("protected") &&
					!param.hasModifier("public")) {
					continue;
				}

				if (!param.isReadonly()) {
					const nameNode = param.getNameNode();
					context.report({
						filePath: context.filePath,
						message: `Constructor parameter '${param.getName()}' should be readonly.`,
						help: this.meta.help,
						line: nameNode.getStartLineNumber(),
						column: nameNode.getStartLinePos() + 1,
					});
				}
			}
		}
	},
};
