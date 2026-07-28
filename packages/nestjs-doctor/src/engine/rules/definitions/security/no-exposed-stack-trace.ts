import { type CallExpression, type Node, SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

const ERROR_VAR_PATTERN = /^(error|err|e|ex|exception)$/;

// Standard log levels. A call also needs a logger receiver to count as logging.
const LOG_METHODS = new Set([
	"debug",
	"error",
	"fatal",
	"log",
	"trace",
	"verbose",
	"warn",
	"warning",
]);

// Words that name a logger. `catalog` and `dialog` end in "log" without any
// word being it, so they are not loggers.
const LOGGER_WORD =
	/^(log|logs|logger|loggers|logging|console|winston|pino|bunyan)$/;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const NON_ALNUM = /[^a-zA-Z0-9]+/;

/** True when any word of the receiver expression names a logger. */
function looksLikeLogger(receiver: string): boolean {
	return receiver
		.replace(CAMEL_BOUNDARY, "$1 $2")
		.split(NON_ALNUM)
		.some((word) => LOGGER_WORD.test(word.toLowerCase()));
}

/** True when the call is a log method on a logger, not a same-named method. */
function isLoggingCall(call: CallExpression): boolean {
	const callee = call.getExpression();
	// A standalone logger such as `debug(...)` carries no receiver to check.
	const identifier = callee.asKind(SyntaxKind.Identifier);
	if (identifier) {
		return LOG_METHODS.has(identifier.getText());
	}
	const access = callee.asKind(SyntaxKind.PropertyAccessExpression);
	if (!access) {
		return false;
	}
	if (!LOG_METHODS.has(access.getName())) {
		return false;
	}
	return looksLikeLogger(access.getExpression().getText());
}

/** True when the stack is being handed to a logging call, at any depth. */
function isLogged(access: Node): boolean {
	let call = access.getFirstAncestorByKind(SyntaxKind.CallExpression);
	while (call) {
		if (isLoggingCall(call)) {
			return true;
		}
		call = call.getFirstAncestorByKind(SyntaxKind.CallExpression);
	}
	return false;
}

export const noExposedStackTrace: Rule = {
	meta: {
		id: "security/no-exposed-stack-trace",
		category: "security",
		severity: "warning",
		description:
			"Stack traces should not be exposed in responses — they leak internal implementation details",
		help: "Log the stack trace internally and return a generic error message to the client.",
	},

	check(context) {
		const propertyAccesses = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAccessExpression
		);

		for (const access of propertyAccesses) {
			if (access.getName() !== "stack") {
				continue;
			}

			const exprText = access.getExpression().getText();
			// Match common error variable names accessing .stack
			if (
				!(
					ERROR_VAR_PATTERN.test(exprText) ||
					exprText.endsWith(".error") ||
					exprText.endsWith(".err")
				)
			) {
				continue;
			}

			// Check if it's being returned or passed to a response
			const parent = access.getParent();
			if (!parent) {
				continue;
			}

			if (isLogged(access)) {
				continue;
			}

			const parentKind = parent.getKind();
			if (
				parentKind === SyntaxKind.ReturnStatement ||
				parentKind === SyntaxKind.PropertyAssignment ||
				parentKind === SyntaxKind.ShorthandPropertyAssignment ||
				parentKind === SyntaxKind.CallExpression
			) {
				context.report({
					filePath: context.filePath,
					message: `Stack trace '${exprText}.stack' may be exposed in response — leaks implementation details.`,
					help: this.meta.help,
					line: access.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
