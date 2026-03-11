import { type CallExpression, SyntaxKind } from "ts-morph";
import { isHttpHandler } from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

function returnsPromise(callExpr: CallExpression): boolean | "unknown" {
	const returnType = callExpr.getReturnType();
	const typeText = returnType.getText();

	if (typeText.startsWith("Promise<") || typeText === "Promise") {
		return true;
	}

	if (typeText === "any" || typeText === "error") {
		return "unknown";
	}

	return false;
}

const ASYNC_PREFIXES = new Set([
	"save",
	"create",
	"insert",
	"update",
	"delete",
	"remove",
	"send",
	"emit",
	"publish",
	"dispatch",
	"execute",
	"fetch",
	"load",
	"upload",
	"download",
	"process",
]);

export const noFireAndForgetAsync: Rule = {
	meta: {
		id: "correctness/no-fire-and-forget-async",
		category: "correctness",
		severity: "warning",
		description:
			"Calling async functions without await leads to unhandled promise rejections",
		help: "Add await before the async call, or use void with explicit error handling if fire-and-forget is intentional.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			for (const method of cls.getMethods()) {
				// Skip HTTP handler methods — they have different semantics
				if (isHttpHandler(method)) {
					continue;
				}

				const body = method.getBody();
				if (!body) {
					continue;
				}

				// Find expression statements that are call expressions (not awaited, not assigned)
				const expressionStatements = body.getDescendantsOfKind(
					SyntaxKind.ExpressionStatement
				);

				for (const stmt of expressionStatements) {
					const expr = stmt.getExpression();

					// Skip if already void-prefixed (intentional fire-and-forget)
					if (expr.getKind() === SyntaxKind.VoidExpression) {
						continue;
					}

					// Skip await expressions
					if (expr.getKind() === SyntaxKind.AwaitExpression) {
						continue;
					}

					// Check if this is a call expression
					if (expr.getKind() !== SyntaxKind.CallExpression) {
						continue;
					}

					const callExpr = expr.asKind(SyntaxKind.CallExpression);
					if (!callExpr) {
						continue;
					}

					const callText = callExpr.getExpression().getText();
					const methodName = callText.split(".").pop() ?? "";

					const promiseCheck = returnsPromise(callExpr);

					if (promiseCheck === false) {
						// Return type is known and is NOT a Promise — safe to skip
						continue;
					}

					if (promiseCheck === "unknown") {
						// Type is unresolvable (any) — fall back to name heuristic
						const lowerName = methodName.toLowerCase();
						const isLikelyAsync =
							ASYNC_PREFIXES.has(lowerName) ||
							[...ASYNC_PREFIXES].some(
								(prefix) => lowerName.startsWith(prefix) && lowerName !== prefix
							);
						if (!isLikelyAsync) {
							continue;
						}
					}

					// Check the call is inside a non-arrow, non-nested function scope
					const parentFunction = stmt.getFirstAncestorByKind(
						SyntaxKind.MethodDeclaration
					);
					if (parentFunction !== method) {
						continue;
					}

					context.report({
						filePath: context.filePath,
						message: `Async call '${methodName}()' is not awaited — unhandled rejections will crash the process.`,
						help: this.meta.help,
						line: stmt.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
