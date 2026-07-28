import { type IfStatement, SyntaxKind } from "ts-morph";
import {
	HTTP_DECORATORS,
	isController,
} from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

/**
 * An if with no else whose branch only throws. Rejecting a bad request is an
 * HTTP concern, so it is not a branch in the method's logic.
 */
function isGuardClause(statement: IfStatement): boolean {
	if (statement.getElseStatement()) {
		return false;
	}
	const branch = statement.getThenStatement();
	const statements =
		branch.getKind() === SyntaxKind.Block
			? branch.asKindOrThrow(SyntaxKind.Block).getStatements()
			: [branch];
	return (
		statements.length > 0 &&
		statements.every((s) => s.getKind() === SyntaxKind.ThrowStatement)
	);
}

export const noBusinessLogicInControllers: Rule = {
	meta: {
		id: "architecture/no-business-logic-in-controllers",
		category: "architecture",
		severity: "error",
		description:
			"Controllers should only handle HTTP concerns — move business logic to services",
		help: "Extract branches, loops, and complex calculations into a service method.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			for (const method of cls.getMethods()) {
				// Only check endpoint handlers (methods with HTTP decorators)
				const isEndpoint = method
					.getDecorators()
					.some((d) => HTTP_DECORATORS.has(d.getName()));
				if (!isEndpoint) {
					continue;
				}

				const body = method.getBody();
				if (!body) {
					continue;
				}

				// Count control flow statements
				const ifStatements = body
					.getDescendantsOfKind(SyntaxKind.IfStatement)
					.filter((statement) => !isGuardClause(statement));
				const forStatements = body.getDescendantsOfKind(
					SyntaxKind.ForStatement
				);
				const forInStatements = body.getDescendantsOfKind(
					SyntaxKind.ForInStatement
				);
				const forOfStatements = body.getDescendantsOfKind(
					SyntaxKind.ForOfStatement
				);
				const whileStatements = body.getDescendantsOfKind(
					SyntaxKind.WhileStatement
				);
				const switchStatements = body.getDescendantsOfKind(
					SyntaxKind.SwitchStatement
				);

				const loopCount =
					forStatements.length +
					forInStatements.length +
					forOfStatements.length +
					whileStatements.length;

				// Allow simple guard clauses (1 if), but flag complex logic
				if (
					ifStatements.length > 1 ||
					loopCount > 0 ||
					switchStatements.length > 0
				) {
					context.report({
						filePath: context.filePath,
						message: `Controller method '${method.getName()}' contains business logic (${ifStatements.length} if, ${loopCount} loops, ${switchStatements.length} switch). Move to a service.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}

				// Check for complex expressions: array methods like map, filter, reduce
				const callExpressions = body.getDescendantsOfKind(
					SyntaxKind.CallExpression
				);
				const complexArrayOps = callExpressions.filter((call) => {
					const expr = call.getExpression();
					if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
						const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
						const name = propAccess?.getName();
						return (
							name === "map" ||
							name === "filter" ||
							name === "reduce" ||
							name === "sort" ||
							name === "flatMap"
						);
					}
					return false;
				});

				if (complexArrayOps.length > 1) {
					context.report({
						filePath: context.filePath,
						message: `Controller method '${method.getName()}' contains data transformation logic (${complexArrayOps.length} array operations). Move to a service.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
