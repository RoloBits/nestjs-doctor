import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const SYNC_IO_METHODS = new Set([
	"readFileSync",
	"writeFileSync",
	"existsSync",
	"mkdirSync",
	"readdirSync",
	"statSync",
	"accessSync",
	"appendFileSync",
	"copyFileSync",
	"renameSync",
	"unlinkSync",
]);

export const noSyncIo: Rule = {
	meta: {
		id: "performance/no-sync-io",
		category: "performance",
		severity: "warning",
		description:
			"Synchronous I/O calls block the event loop and should be avoided in NestJS applications",
		help: "Use the async variant (e.g., readFile instead of readFileSync) with await.",
	},

	check(context) {
		const callExpressions = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		);

		for (const call of callExpressions) {
			const expr = call.getExpression();
			const methodName = expr.getText().split(".").pop() ?? "";

			if (!SYNC_IO_METHODS.has(methodName)) {
				continue;
			}

			context.report({
				filePath: context.filePath,
				message: `Synchronous I/O call '${methodName}()' blocks the event loop.`,
				help: this.meta.help,
				line: call.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
