import { SyntaxKind } from "ts-morph";
import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noExposedEnvVars: Rule = {
	meta: {
		id: "security/no-exposed-env-vars",
		category: "security",
		severity: "warning",
		description:
			"Use NestJS ConfigService instead of direct process.env access in Injectable/Controller classes",
		help: "Inject ConfigService and use configService.get('VAR_NAME') instead of process.env.VAR_NAME.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (
				!(hasDecorator(cls, "Injectable") || hasDecorator(cls, "Controller"))
			) {
				continue;
			}

			const propertyAccesses = cls.getDescendantsOfKind(
				SyntaxKind.PropertyAccessExpression
			);

			for (const access of propertyAccesses) {
				const expr = access.getExpression();
				if (expr.getText() !== "process.env") {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `Direct 'process.env.${access.getName()}' access in '${cls.getName()}'. Use ConfigService instead.`,
					help: this.meta.help,
					line: access.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
