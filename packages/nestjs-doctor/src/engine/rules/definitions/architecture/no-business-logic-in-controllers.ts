import { type IfStatement, type Statement, SyntaxKind } from "ts-morph";
import {
	declaresRoutes,
	HTTP_DECORATORS,
} from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

/** True when the branch is non-empty and every statement in it throws. */
function onlyThrows(branch: Statement): boolean {
	const statements =
		branch.getKind() === SyntaxKind.Block
			? branch.asKindOrThrow(SyntaxKind.Block).getStatements()
			: [branch];
	return (
		statements.length > 0 &&
		statements.every((s) => s.getKind() === SyntaxKind.ThrowStatement)
	);
}

/** The next link of a chain, written either `else if` or `else { if }`. */
function chainedIf(alternative: Statement): IfStatement | undefined {
	const direct = alternative.asKind(SyntaxKind.IfStatement);
	if (direct) {
		return direct;
	}
	const statements = alternative.asKind(SyntaxKind.Block)?.getStatements();
	return statements?.length === 1
		? statements[0].asKind(SyntaxKind.IfStatement)
		: undefined;
}

/**
 * An if whose every branch only throws, including an else-if chain. Rejecting a
 * bad request is an HTTP concern, so it is not a branch in the method's logic.
 */
function isGuardClause(statement: IfStatement): boolean {
	if (!onlyThrows(statement.getThenStatement())) {
		return false;
	}
	const alternative = statement.getElseStatement();
	if (!alternative) {
		return true;
	}
	const chained = chainedIf(alternative);
	return chained ? isGuardClause(chained) : onlyThrows(alternative);
}

/** True when this if is a later link of a chain, which the head already counts. */
function isChainLink(statement: IfStatement): boolean {
	const parent = statement.getParent();
	const owner =
		parent?.asKind(SyntaxKind.IfStatement) ??
		parent
			?.asKind(SyntaxKind.Block)
			?.getParent()
			?.asKind(SyntaxKind.IfStatement);
	const alternative = owner?.getElseStatement();
	return Boolean(alternative && chainedIf(alternative) === statement);
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
			if (!declaresRoutes(cls)) {
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
					.filter(
						(statement) => !(isChainLink(statement) || isGuardClause(statement))
					);
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

				// One branch of the method's own logic is allowed. Guard clauses
				// were filtered out above and do not count against it.
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
