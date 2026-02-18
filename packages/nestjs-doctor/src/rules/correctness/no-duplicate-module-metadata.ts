import { SyntaxKind } from "ts-morph";
import { isModule } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const MODULE_ARRAY_PROPS = ["providers", "controllers", "imports", "exports"];

export const noDuplicateModuleMetadata: Rule = {
	meta: {
		id: "correctness/no-duplicate-module-metadata",
		category: "correctness",
		severity: "warning",
		description:
			"Same identifier should not appear twice in a module metadata array",
		help: "Remove the duplicate entry from the module metadata.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isModule(cls)) {
				continue;
			}

			const moduleDecorator = cls.getDecorator("Module");
			if (!moduleDecorator) {
				continue;
			}

			const args = moduleDecorator.getArguments()[0];
			if (!args || args.getKind() !== SyntaxKind.ObjectLiteralExpression) {
				continue;
			}

			const obj = args.asKind(SyntaxKind.ObjectLiteralExpression);
			if (!obj) {
				continue;
			}

			for (const propName of MODULE_ARRAY_PROPS) {
				const prop = obj.getProperty(propName);
				if (!prop) {
					continue;
				}

				const arrayLiteral = prop.getChildrenOfKind(
					SyntaxKind.ArrayLiteralExpression
				)[0];
				if (!arrayLiteral) {
					continue;
				}

				const seen = new Set<string>();
				for (const element of arrayLiteral.getElements()) {
					const text = element.getText();
					if (seen.has(text)) {
						context.report({
							filePath: context.filePath,
							message: `Duplicate '${text}' in @Module() ${propName} array.`,
							help: this.meta.help,
							line: element.getStartLineNumber(),
							column: 1,
						});
					} else {
						seen.add(text);
					}
				}
			}
		}
	},
};
