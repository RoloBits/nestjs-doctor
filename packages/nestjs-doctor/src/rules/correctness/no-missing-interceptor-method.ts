import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noMissingInterceptorMethod: Rule = {
	meta: {
		id: "correctness/no-missing-interceptor-method",
		category: "correctness",
		severity: "error",
		description: "Interceptor classes must implement the intercept() method",
		help: "Add an intercept(context: ExecutionContext, next: CallHandler) method to the interceptor class.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			const name = cls.getName() ?? "";
			if (!name.endsWith("Interceptor")) {
				continue;
			}
			if (!hasDecorator(cls, "Injectable")) {
				continue;
			}

			const hasIntercept = cls
				.getMethods()
				.some((m) => m.getName() === "intercept");
			if (!hasIntercept) {
				context.report({
					filePath: context.filePath,
					message: `Interceptor '${name}' is missing the 'intercept()' method.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
