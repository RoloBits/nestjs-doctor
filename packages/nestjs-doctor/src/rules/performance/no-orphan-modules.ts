import type { ProjectRule } from "../types.js";

export const noOrphanModules: ProjectRule = {
	meta: {
		id: "performance/no-orphan-modules",
		category: "performance",
		severity: "info",
		description:
			"Module is never imported by any other module and may be dead code",
		help: "Import this module in another module or remove it if it is unused.",
		scope: "project",
	},

	check(context) {
		// Collect all module names that are imported by at least one other module
		const importedModules = new Set<string>();
		for (const mod of context.moduleGraph.modules.values()) {
			for (const imp of mod.imports) {
				importedModules.add(imp);
			}
		}

		for (const mod of context.moduleGraph.modules.values()) {
			// Skip AppModule — it's the root and is never imported
			if (mod.name === "AppModule") {
				continue;
			}

			if (!importedModules.has(mod.name)) {
				context.report({
					filePath: mod.filePath,
					message: `Module '${mod.name}' is never imported by any other module.`,
					help: this.meta.help,
					line: mod.classDeclaration.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
