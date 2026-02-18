import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const requireValidationPipe: Rule = {
	meta: {
		id: "security/require-validation-pipe",
		category: "security",
		severity: "warning",
		description:
			"Handlers with @Body() parameters should have validation via @UsePipes(ValidationPipe)",
		help: "Add @UsePipes(new ValidationPipe()) to the method or controller, or set up global validation.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			const hasClassPipe = cls
				.getDecorators()
				.some((d) => d.getName() === "UsePipes");

			for (const method of cls.getMethods()) {
				// Check if any parameter has @Body() decorator
				const hasBodyParam = method
					.getParameters()
					.some((param) =>
						param.getDecorators().some((d) => d.getName() === "Body")
					);
				if (!hasBodyParam) {
					continue;
				}

				if (hasClassPipe) {
					continue;
				}

				const hasMethodPipe = method
					.getDecorators()
					.some((d) => d.getName() === "UsePipes");
				if (hasMethodPipe) {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `Handler '${method.getName()}()' has @Body() parameter but no validation pipe.`,
					help: this.meta.help,
					line: method.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
