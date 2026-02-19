import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const HTTP_METHOD_DECORATORS = new Set([
	"Get",
	"Post",
	"Put",
	"Delete",
	"Patch",
	"All",
	"Head",
	"Options",
]);

export const noDuplicateRoutes: Rule = {
	meta: {
		id: "correctness/no-duplicate-routes",
		category: "correctness",
		severity: "error",
		description:
			"Same HTTP method + route path + version should not appear twice in a single controller",
		help: "Remove or rename one of the duplicate route handlers.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
				continue;
			}

			const routeMap = new Map<string, string>();

			for (const method of cls.getMethods()) {
				for (const decorator of method.getDecorators()) {
					const decoratorName = decorator.getName();
					if (!HTTP_METHOD_DECORATORS.has(decoratorName)) {
						continue;
					}

					const args = decorator.getArguments();
					const path = args.length > 0 ? args[0].getText() : '""';
					const versionDecorator = method.getDecorator("Version");
					const version = versionDecorator
						? (versionDecorator.getArguments()[0]?.getText() ?? "")
						: "";
					const routeKey = `${decoratorName}:${path}:${version}`;

					const existing = routeMap.get(routeKey);
					if (existing) {
						context.report({
							filePath: context.filePath,
							message: `Duplicate route: @${decoratorName}(${path}) is already defined in '${existing}()'.`,
							help: this.meta.help,
							line: method.getStartLineNumber(),
							column: 1,
						});
					} else {
						routeMap.set(routeKey, method.getName());
					}
				}
			}
		}
	},
};
