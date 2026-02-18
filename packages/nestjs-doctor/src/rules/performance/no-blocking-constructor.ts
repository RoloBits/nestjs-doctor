import { SyntaxKind } from "ts-morph";
import { hasDecorator } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const BLOCKING_KINDS = new Set([
	SyntaxKind.ForStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
	SyntaxKind.AwaitExpression,
]);

export const noBlockingConstructor: Rule = {
	meta: {
		id: "performance/no-blocking-constructor",
		category: "performance",
		severity: "warning",
		description:
			"Constructors in Injectable/Controller classes should not contain heavy operations",
		help: "Move complex initialization logic to onModuleInit() lifecycle method instead.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (
				!(hasDecorator(cls, "Injectable") || hasDecorator(cls, "Controller"))
			) {
				continue;
			}

			const ctor = cls.getConstructors()[0];
			if (!ctor) {
				continue;
			}

			const body = ctor.getBody();
			if (!body) {
				continue;
			}

			for (const descendant of body.getDescendants()) {
				if (BLOCKING_KINDS.has(descendant.getKind())) {
					context.report({
						filePath: context.filePath,
						message: `Constructor in '${cls.getName()}' contains blocking operation — use onModuleInit() instead.`,
						help: this.meta.help,
						line: ctor.getStartLineNumber(),
						column: 1,
					});
					break;
				}
			}
		}
	},
};
