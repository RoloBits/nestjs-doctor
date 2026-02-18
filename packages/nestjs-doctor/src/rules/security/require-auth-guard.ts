import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const requireAuthGuard: Rule = {
	meta: {
		id: "security/require-auth-guard",
		category: "security",
		severity: "info",
		description:
			"Controller classes should have @UseGuards() at class or method level",
		help: "Add @UseGuards(AuthGuard) to the controller class or its handler methods.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			// Check class-level guards
			const hasClassGuard = cls
				.getDecorators()
				.some((d) => d.getName() === "UseGuards");
			if (hasClassGuard) {
				continue;
			}

			// Check if any method has guards
			const hasMethodGuard = cls
				.getMethods()
				.some((method) =>
					method.getDecorators().some((d) => d.getName() === "UseGuards")
				);
			if (hasMethodGuard) {
				continue;
			}

			context.report({
				filePath: context.filePath,
				message: `Controller '${cls.getName()}' has no @UseGuards() protection.`,
				help: this.meta.help,
				line: cls.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
