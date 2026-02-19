import type { ClassDeclaration } from "ts-morph";
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

		// Build a class-name-to-declaration index for O(1) lookups
		const classIndex = new Map<
			string,
			{ cls: ClassDeclaration; filePath: string }[]
		>();
		for (const filePath of context.files) {
			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				const name = cls.getName();
				if (name) {
					const entries = classIndex.get(name) ?? [];
					entries.push({ cls, filePath });
					classIndex.set(name, entries);
				}
			}
		}

		for (const mod of context.moduleGraph.modules.values()) {
			for (const providerName of mod.providers) {
				if (providerNames.has(providerName)) {
					continue;
				}

				// O(1) lookup instead of iterating all files
				const classEntries = classIndex.get(providerName);
				if (!classEntries) {
					continue;
				}

				for (const { cls, filePath } of classEntries) {
					if (!cls.getDecorator("Injectable")) {
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
	},
};
