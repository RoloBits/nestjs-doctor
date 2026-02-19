import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

export const noSynchronizeInProduction: Rule = {
	meta: {
		id: "security/no-synchronize-in-production",
		category: "security",
		severity: "error",
		description:
			"TypeORM synchronize: true auto-syncs schema and can drop columns or tables in production",
		help: "Set synchronize: false and use migrations for production schema changes.",
	},

	check(context) {
		const propertyAssignments = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAssignment
		);

		for (const prop of propertyAssignments) {
			if (prop.getName() !== "synchronize") {
				continue;
			}

			const initializer = prop.getInitializer();
			if (!initializer) {
				continue;
			}

			if (initializer.getText() === "true") {
				context.report({
					filePath: context.filePath,
					message:
						"TypeORM 'synchronize: true' can auto-drop columns and tables in production.",
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
