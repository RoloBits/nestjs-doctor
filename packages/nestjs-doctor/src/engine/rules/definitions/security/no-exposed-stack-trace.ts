import { type Node, SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

const ERROR_VAR_PATTERN = /^(error|err|e|ex|exception)$/;

// Standard log levels. Sending a stack to one of these is the remedy this rule
// recommends, not the leak it looks for.
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

/** True when the stack is being handed to a logging call, at any depth. */
function isLogged(access: Node): boolean {
	const call = access.getFirstAncestorByKind(SyntaxKind.CallExpression);
	if (!call) {
		return false;
	}
	const callee = call.getExpression().getText().split(".").pop() ?? "";
	return LOG_METHODS.has(callee);
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
