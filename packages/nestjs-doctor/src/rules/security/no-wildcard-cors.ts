import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noWildcardCors: Rule = {
	meta: {
		id: "security/no-wildcard-cors",
		category: "security",
		severity: "error",
		description:
			"CORS should not be configured with origin: '*' or origin: true — allows any domain",
		help: "Specify allowed origins explicitly instead of using wildcard CORS.",
	},

	check(context) {
		const propertyAssignments = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAssignment
		);

		for (const prop of propertyAssignments) {
			if (prop.getName() !== "origin") {
				continue;
			}

			const initializer = prop.getInitializer();
			if (!initializer) {
				continue;
			}

			const text = initializer.getText();
			if (text === "'*'" || text === '"*"' || text === "true") {
				context.report({
					filePath: context.filePath,
					message: `CORS configured with origin: ${text} — allows requests from any domain.`,
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
