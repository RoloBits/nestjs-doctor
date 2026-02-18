import { SyntaxKind } from "ts-morph";
import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const noDangerousRedirects: Rule = {
	meta: {
		id: "security/no-dangerous-redirects",
		category: "security",
		severity: "error",
		description:
			"Redirects using user-controlled input (from @Query/@Param) are an open redirect vulnerability",
		help: "Validate redirect URLs against an allowlist of safe destinations.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			for (const method of cls.getMethods()) {
				// Collect parameter names decorated with @Query or @Param
				const userInputParams = new Set<string>();
				for (const param of method.getParameters()) {
					const hasUserInputDecorator = param
						.getDecorators()
						.some((d) => d.getName() === "Query" || d.getName() === "Param");
					if (hasUserInputDecorator) {
						userInputParams.add(param.getName());
					}
				}

				if (userInputParams.size === 0) {
					continue;
				}

				// Check for res.redirect() calls with user input
				const callExpressions = method.getDescendantsOfKind(
					SyntaxKind.CallExpression
				);

				for (const call of callExpressions) {
					const exprText = call.getExpression().getText();
					if (!exprText.endsWith("redirect")) {
						continue;
					}

					for (const arg of call.getArguments()) {
						const argText = arg.getText();
						if (userInputParams.has(argText)) {
							context.report({
								filePath: context.filePath,
								message: `Redirect uses user-controlled parameter '${argText}' — open redirect risk.`,
								help: this.meta.help,
								line: call.getStartLineNumber(),
								column: 1,
							});
						}
					}
				}

				// Check for @Redirect() decorator with dynamic value
				const redirectDecorator = method
					.getDecorators()
					.find((d) => d.getName() === "Redirect");
				if (redirectDecorator) {
					for (const arg of redirectDecorator.getArguments()) {
						const argText = arg.getText();
						if (userInputParams.has(argText)) {
							context.report({
								filePath: context.filePath,
								message: `@Redirect() uses user-controlled parameter '${argText}' — open redirect risk.`,
								help: this.meta.help,
								line: redirectDecorator.getStartLineNumber(),
								column: 1,
							});
						}
					}
				}
			}
		}
	},
};
