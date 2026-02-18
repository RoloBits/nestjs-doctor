import type { ProjectRule } from "../types.js";

const DEFAULT_MAX_PROVIDERS = 10;
const DEFAULT_MAX_IMPORTS = 15;

export const noGodModule: ProjectRule = {
	meta: {
		id: "architecture/no-god-module",
		category: "architecture",
		severity: "warning",
		description:
			"Modules with too many providers or imports should be split into smaller feature modules",
		help: "Split this module into smaller, focused feature modules.",
		scope: "project",
	},

	check(context) {
		const maxProviders =
			context.config.thresholds?.godModuleProviders ?? DEFAULT_MAX_PROVIDERS;
		const maxImports =
			context.config.thresholds?.godModuleImports ?? DEFAULT_MAX_IMPORTS;

		for (const mod of context.moduleGraph.modules.values()) {
			if (mod.providers.length > maxProviders) {
				context.report({
					filePath: mod.filePath,
					message: `Module '${mod.name}' has ${mod.providers.length} providers (max: ${maxProviders}). Consider splitting into smaller modules.`,
					help: this.meta.help,
					line: mod.classDeclaration.getStartLineNumber(),
					column: 1,
				});
			}

			if (mod.imports.length > maxImports) {
				context.report({
					filePath: mod.filePath,
					message: `Module '${mod.name}' has ${mod.imports.length} imports (max: ${maxImports}). Consider grouping into feature modules.`,
					help: this.meta.help,
					line: mod.classDeclaration.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
