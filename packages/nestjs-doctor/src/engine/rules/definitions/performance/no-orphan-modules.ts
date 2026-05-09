import type { ProjectRule } from "../../types.js";

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
		// Collect every composite key that's imported by at least one other module.
		// Reading the edge Set (composite-keyed) avoids false negatives when two
		// modules share a class name, which would collapse on the raw `imports`
		// string array.
		const importedKeys = new Set<string>();
		for (const targets of context.moduleGraph.edges.values()) {
			for (const target of targets) {
				importedKeys.add(target);
			}
		}

		for (const mod of context.moduleGraph.modules.values()) {
			// Skip AppModule — it's the root and is never imported
			if (mod.name === "AppModule") {
				continue;
			}

			if (!importedKeys.has(mod.key)) {
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
