import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noCsrfDisabled: Rule = {
	meta: {
		id: "security/no-csrf-disabled",
		category: "security",
		severity: "error",
		description: "CSRF protection should not be explicitly disabled",
		help: "Enable CSRF protection or remove the explicit disabling of it.",
	},

	check(context) {
		const propertyAssignments = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAssignment
		);

		for (const prop of propertyAssignments) {
			const name = prop.getName();
			if (name !== "csrf" && name !== "csrfProtection") {
				continue;
			}

			const initializer = prop.getInitializer();
			if (!initializer) {
				continue;
			}

			if (initializer.getText() === "false") {
				context.report({
					filePath: context.filePath,
					message: `CSRF protection explicitly disabled (${name}: false).`,
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
