import { HTTP_DECORATORS, isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noEmptyHandlers: Rule = {
	meta: {
		id: "correctness/no-empty-handlers",
		category: "correctness",
		severity: "warning",
		description: "Controller HTTP handlers should not have empty bodies",
		help: "Add implementation to the handler method or remove it if unnecessary.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			for (const method of cls.getMethods()) {
				const hasHttpDecorator = method
					.getDecorators()
					.some((d) => HTTP_DECORATORS.has(d.getName()));

				if (!hasHttpDecorator) {
					continue;
				}

				const body = method.getBody();
				if (!body) {
					continue;
				}

				const statements = body.getStatements();
				if (statements.length === 0) {
					context.report({
						filePath: context.filePath,
						message: `Handler '${method.getName()}()' has an empty body.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
