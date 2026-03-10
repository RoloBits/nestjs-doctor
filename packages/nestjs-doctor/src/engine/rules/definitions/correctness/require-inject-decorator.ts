import { isInjectable } from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

export const requireInjectDecorator: Rule = {
	meta: {
		id: "correctness/require-inject-decorator",
		category: "correctness",
		severity: "error",
		description:
			"Constructor parameters without type annotations must have @Inject() decorator for NestJS DI to resolve them",
		help: "Add a type annotation or @Inject() decorator to the constructor parameter.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isInjectable(cls)) {
				continue;
			}

			const ctor = cls.getConstructors()[0];
			if (!ctor) {
				continue;
			}

			for (const param of ctor.getParameters()) {
				const typeNode = param.getTypeNode();
				const hasInject = param
					.getDecorators()
					.some((d) => d.getName() === "Inject");

				if (!(typeNode || hasInject)) {
					context.report({
						filePath: context.filePath,
						message: `Constructor parameter '${param.getName()}' in '${cls.getName()}' has no type annotation and no @Inject() decorator — NestJS cannot resolve it.`,
						help: this.meta.help,
						line: param.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
