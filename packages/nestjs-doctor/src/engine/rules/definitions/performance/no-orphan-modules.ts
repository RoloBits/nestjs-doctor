import { collectBootstrappedModules } from "../../../graph/entry-points.js";

/** A module declared here is the application root whatever its class is called. */
const ROOT_MODULE_FILE = /(^|\/)(app|main|root)\.module\.[mc]?ts$/;

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
		// Collect all module names that are imported by at least one other module
		const importedModules = new Set<string>();
		for (const mod of context.moduleGraph.modules.values()) {
			for (const imp of mod.imports) {
				importedModules.add(imp);
			}
		}

		// A bootstrapped module is an entry point, so nothing imports it. AppModule
		// stays as a fallback for projects whose bootstrap is outside the scan.
		const entryPoints = collectBootstrappedModules(
			context.project,
			context.files
		);

		for (const mod of context.moduleGraph.modules.values()) {
			if (
				mod.name === "AppModule" ||
				ROOT_MODULE_FILE.test(mod.filePath) ||
				entryPoints.has(mod.name)
			) {
				continue;
			}

			if (!importedModules.has(mod.name)) {
				context.report({
					filePath: mod.filePath,
					message: `Module '${mod.name}' is never imported by any other module.`,
					help: this.meta.help,
					line: mod.classDeclaration?.getStartLineNumber() ?? 1,
					column: 1,
				});
			}
		}
	},
};
