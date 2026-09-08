import {
	type CallExpression,
	type ClassDeclaration,
	type Node,
	SyntaxKind,
} from "ts-morph";
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

// Only consulted when the return type is unresolvable. `emit` is absent on
// purpose: EventEmitter2, socket.io and ClientProxy all return synchronously.
const ASYNC_PREFIXES = new Set([
	"save",
	"create",
	"insert",
	"update",
	"delete",
	"remove",
	"send",
	"publish",
	"dispatch",
	"execute",
	"fetch",
	"load",
	"upload",
	"download",
	"process",
]);

/** The member name in `this.member.method()`, when the call has that shape. */
function thisMemberName(callExpr: CallExpression): string | undefined {
	const receiver = callExpr
		.getExpression()
		.asKind(SyntaxKind.PropertyAccessExpression)
		?.getExpression()
		.asKind(SyntaxKind.PropertyAccessExpression);
	return receiver?.getExpression().getKind() === SyntaxKind.ThisKeyword
		? receiver.getName()
		: undefined;
}

/** True when the class declares the member, as a property or a constructor parameter. */
function declaresMember(cls: ClassDeclaration, name: string): boolean {
	return Boolean(
		cls.getProperty(name) ??
			cls
				.getConstructors()[0]
				?.getParameters()
				.find((parameter) => parameter.getName() === name)
	);
}

/**
 * True when the name suggests an async call on a member the class never
 * declares. A written-down type that resolves to nothing belongs to a package
 * the scan does not read, so the name is not evidence.
 */
function nameMayBeAsync(callExpr: CallExpression, methodName: string): boolean {
	const cls = callExpr.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
	const member = thisMemberName(callExpr);
	if (!(cls && member) || declaresMember(cls, member)) {
		return false;
	}
	const lowerName = methodName.toLowerCase();
	return (
		ASYNC_PREFIXES.has(lowerName) ||
		[...ASYNC_PREFIXES].some(
			(prefix) => lowerName.startsWith(prefix) && lowerName !== prefix
		)
	);
}

/**
 * A handler that ends by throwing leaves the rejection unhandled. Only an
 * inline function body is read, so a handler passed by name is left alone.
 */
function onlyRethrows(handler: Node | undefined): boolean {
	if (!handler) {
		return false;
	}
	const inner =
		handler.asKind(SyntaxKind.ParenthesizedExpression)?.getExpression() ??
		handler;
	const fn =
		inner.asKind(SyntaxKind.ArrowFunction) ??
		inner.asKind(SyntaxKind.FunctionExpression);
	if (!fn) {
		return false;
	}
	const body = fn.getBody();
	if (body.getKind() !== SyntaxKind.Block) {
		return false;
	}
	const statements = body.asKindOrThrow(SyntaxKind.Block).getStatements();
	return statements.at(-1)?.getKind() === SyntaxKind.ThrowStatement;
}

/**
 * True when the chain ends in `.catch(h)` or a `.then(ok, err)`, unless the
 * catch handler only rethrows.
 */
function hasRejectionHandler(callExpr: CallExpression): boolean {
	let current: CallExpression | undefined = callExpr;
	while (current) {
		const expression = current.getExpression();
		if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
			return false;
		}
		const access = expression.asKindOrThrow(
			SyntaxKind.PropertyAccessExpression
		);
		const name = access.getName();
		// `.catch()` with no handler still rejects, so it handles nothing.
		if (name === "catch") {
			const handler = current.getArguments()[0];
			return Boolean(handler) && !onlyRethrows(handler);
		}
		if (name === "then" && current.getArguments().length > 1) {
			return !onlyRethrows(current.getArguments()[1]);
		}
		if (name !== "then" && name !== "finally") {
			return false;
		}
		current = access.getExpression().asKind(SyntaxKind.CallExpression);
	}
	return false;
}

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

					if (hasRejectionHandler(callExpr)) {
						continue;
					}

					const promiseCheck = returnsPromise(callExpr);

					if (promiseCheck === false) {
						// Return type is known and is NOT a Promise — safe to skip
						continue;
					}

					if (
						promiseCheck === "unknown" &&
						!nameMayBeAsync(callExpr, methodName)
					) {
						continue;
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
