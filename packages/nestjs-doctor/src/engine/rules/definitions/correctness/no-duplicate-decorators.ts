import { HTTP_DECORATORS } from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

const WHITESPACE = /\s+/g;

// A target can carry only one of these, so a second is an error whatever its
// arguments. Everything else repeats legitimately unless written verbatim twice.
const SINGLE_USE_DECORATORS = new Set([
	"Catch",
	"Controller",
	"Entity",
	"Global",
	"Injectable",
	"Module",
	"Resolver",
	"WebSocketGateway",
	...HTTP_DECORATORS,
]);

export const noDuplicateDecorators: Rule = {
	meta: {
		id: "correctness/no-duplicate-decorators",
		category: "correctness",
		severity: "warning",
		description: "Same decorator should not appear twice on a single target",
		help: "Remove the second decorator. Only one of them takes effect, so the other is dropped without an error.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			// Check class-level decorators
			checkDecorators(cls.getDecorators(), context, this.meta.help);

			// Check method-level decorators
			for (const method of cls.getMethods()) {
				checkDecorators(method.getDecorators(), context, this.meta.help);
			}

			// Check property-level decorators
			for (const prop of cls.getProperties()) {
				checkDecorators(prop.getDecorators(), context, this.meta.help);
			}

			// Check constructor parameter decorators
			for (const ctor of cls.getConstructors()) {
				for (const param of ctor.getParameters()) {
					checkDecorators(param.getDecorators(), context, this.meta.help);
				}
			}
		}
	},
};

function checkDecorators(
	decorators: {
		getName(): string;
		getStartLineNumber(): number;
		getText(): string;
	}[],
	context: {
		filePath: string;
		report(diagnostic: {
			filePath: string;
			message: string;
			help: string;
			line: number;
			column: number;
		}): void;
	},
	help: string
): void {
	const seen = new Set<string>();

	for (const decorator of decorators) {
		// The whole decorator, so @UseInterceptors(A) and @UseInterceptors(B)
		// are two interceptors rather than a repeat.
		const name = decorator.getName();
		const key = SINGLE_USE_DECORATORS.has(name)
			? name
			: decorator.getText().replace(WHITESPACE, " ");

		if (seen.has(key)) {
			context.report({
				filePath: context.filePath,
				message: `Duplicate @${name}() decorator on the same target.`,
				help,
				line: decorator.getStartLineNumber(),
				column: 1,
			});
		} else {
			seen.add(key);
		}
	}
}
