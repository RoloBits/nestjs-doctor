import { findCircularDeps } from "../../engine/module-graph.js";
import type { ProjectRule } from "../types.js";

export const noCircularModuleDeps: ProjectRule = {
	meta: {
		id: "architecture/no-circular-module-deps",
		category: "architecture",
		severity: "error",
		description: "Circular dependencies in @Module() import graph",
		help: "Break the cycle by extracting shared logic into a separate module or using forwardRef().",
		scope: "project",
	},

	check(context) {
		const cycles = findCircularDeps(context.moduleGraph);

		for (const cycle of cycles) {
			const cycleStr = cycle.join(" -> ");
			const firstModule = context.moduleGraph.modules.get(cycle[0]);

			context.report({
				filePath: firstModule?.filePath ?? "unknown",
				message: `Circular module dependency detected: ${cycleStr}`,
				help: this.meta.help,
				line: firstModule?.classDeclaration.getStartLineNumber() ?? 1,
				column: 1,
			});
		}
	},
};
