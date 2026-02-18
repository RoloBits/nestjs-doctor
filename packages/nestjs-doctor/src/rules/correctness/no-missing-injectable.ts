import type { ProjectRule } from "../types.js";

export const noMissingInjectable: ProjectRule = {
	meta: {
		id: "correctness/no-missing-injectable",
		category: "correctness",
		severity: "error",
		description:
			"Class listed in a module's providers must have the @Injectable() decorator",
		help: "Add @Injectable() decorator to the class.",
		scope: "project",
	},

	check(context) {
		const providerNames = new Set(
			[...context.providers.values()].map((p) => p.name)
		);

		for (const mod of context.moduleGraph.modules.values()) {
			for (const providerName of mod.providers) {
				if (providerNames.has(providerName)) {
					continue;
				}

				// Check if the class exists but lacks @Injectable
				for (const filePath of context.files) {
					const sourceFile = context.project.getSourceFile(filePath);
					if (!sourceFile) {
						continue;
					}

					for (const cls of sourceFile.getClasses()) {
						if (
							cls.getName() === providerName &&
							!cls.getDecorator("Injectable")
						) {
							context.report({
								filePath,
								message: `Class '${providerName}' is listed in '${mod.name}' providers but is missing @Injectable() decorator.`,
								help: this.meta.help,
								line: cls.getStartLineNumber(),
								column: 1,
							});
						}
					}
				}
			}
		}
	},
};
