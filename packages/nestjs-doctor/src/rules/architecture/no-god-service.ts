import type { ProjectRule } from "../types.js";

const DEFAULT_MAX_METHODS = 10;
const DEFAULT_MAX_DEPS = 8;

export const noGodService: ProjectRule = {
	meta: {
		id: "architecture/no-god-service",
		category: "architecture",
		severity: "warning",
		description:
			"Services with too many public methods or dependencies should be split",
		help: "Split this service into smaller, focused services with single responsibilities.",
		scope: "project",
	},

	check(context) {
		const maxMethods =
			context.config.thresholds?.godServiceMethods ?? DEFAULT_MAX_METHODS;
		const maxDeps =
			context.config.thresholds?.godServiceDeps ?? DEFAULT_MAX_DEPS;

		for (const provider of context.providers.values()) {
			if (provider.publicMethodCount > maxMethods) {
				context.report({
					filePath: provider.filePath,
					message: `Service '${provider.name}' has ${provider.publicMethodCount} public methods (max: ${maxMethods}). Consider splitting.`,
					help: this.meta.help,
					line: provider.classDeclaration.getStartLineNumber(),
					column: 1,
				});
			}

			if (provider.dependencies.length > maxDeps) {
				context.report({
					filePath: provider.filePath,
					message: `Service '${provider.name}' has ${provider.dependencies.length} dependencies (max: ${maxDeps}). Consider splitting.`,
					help: this.meta.help,
					line: provider.classDeclaration.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
