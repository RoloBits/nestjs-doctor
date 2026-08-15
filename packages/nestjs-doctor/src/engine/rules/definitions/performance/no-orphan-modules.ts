import { collectEntryModules } from "../../../graph/entry-points.js";
import type { ProjectRule } from "../../types.js";

export const noOrphanModules: ProjectRule = {
	meta: {
		id: "performance/no-orphan-modules",
		category: "performance",
		severity: "info",
		tags: ["module-graph"],
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

		// An entry module is an application root, so nothing imports it.
		const entryPoints = collectEntryModules(
			context.project,
			context.files,
			context.moduleGraph
		);

		for (const mod of context.moduleGraph.modules.values()) {
			if (entryPoints.has(mod.name)) {
				continue;
			}

			if (!importedModules.has(mod.name)) {
				context.report({
					filePath: mod.filePath,
					message: `Module '${mod.name}' is never imported by any other module.`,
					help: this.meta.help,
					// The same line the orphan prune keys reachability on.
					line: mod.line ?? mod.classDeclaration?.getStartLineNumber() ?? 1,
					column: 1,
				});
			}
		}
	},
};
