import type { Rule } from "../types.js";

const LIFECYCLE_MAP: Record<string, string> = {
	onModuleInit: "OnModuleInit",
	onModuleDestroy: "OnModuleDestroy",
	onApplicationBootstrap: "OnApplicationBootstrap",
	onApplicationShutdown: "OnApplicationShutdown",
	beforeApplicationShutdown: "BeforeApplicationShutdown",
};

export const requireLifecycleInterface: Rule = {
	meta: {
		id: "correctness/require-lifecycle-interface",
		category: "correctness",
		severity: "warning",
		description:
			"Classes with lifecycle methods should implement the corresponding NestJS interface",
		help: "Add 'implements OnModuleInit' (or the appropriate interface) to the class declaration.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			const implementedInterfaces = cls.getImplements().map((i) => i.getText());

			for (const method of cls.getMethods()) {
				const methodName = method.getName();
				const expectedInterface = LIFECYCLE_MAP[methodName];
				if (!expectedInterface) {
					continue;
				}

				if (!implementedInterfaces.some((i) => i.includes(expectedInterface))) {
					context.report({
						filePath: context.filePath,
						message: `Class '${cls.getName()}' has '${methodName}()' but does not implement '${expectedInterface}'.`,
						help: this.meta.help,
						line: method.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
