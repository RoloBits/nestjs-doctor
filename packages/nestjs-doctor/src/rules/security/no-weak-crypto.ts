import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const WEAK_ALGORITHMS = new Set(["md5", "sha1"]);

export const noWeakCrypto: Rule = {
	meta: {
		id: "security/no-weak-crypto",
		category: "security",
		severity: "warning",
		description:
			"Weak hashing algorithms (MD5, SHA1) should not be used for security purposes",
		help: "Use a stronger algorithm like SHA-256 or bcrypt for password hashing.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const exprText = call.getExpression().getText();
			if (!exprText.endsWith("createHash")) {
				continue;
			}

			const args = call.getArguments();
			if (args.length === 0) {
				continue;
			}

			const firstArg = args[0];
			if (firstArg.getKind() !== SyntaxKind.StringLiteral) {
				continue;
			}

			const algorithm = firstArg.getText().slice(1, -1).toLowerCase();
			if (WEAK_ALGORITHMS.has(algorithm)) {
				context.report({
					filePath: context.filePath,
					message: `Weak hashing algorithm '${algorithm}' used in createHash().`,
					help: this.meta.help,
					line: call.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
