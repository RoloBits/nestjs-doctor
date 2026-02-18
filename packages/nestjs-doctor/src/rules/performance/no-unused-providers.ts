import type { ProjectRule } from "../types.js";

const SKIP_SUFFIXES = [
	"Guard",
	"Interceptor",
	"Filter",
	"Middleware",
	"Strategy",
];

export const noUnusedProviders: ProjectRule = {
	meta: {
		id: "performance/no-unused-providers",
		category: "performance",
		severity: "warning",
		description:
			"Injectable providers that are never injected by any other provider may be dead code",
		help: "Remove the unused provider or inject it where needed.",
		scope: "project",
	},

	check(context) {
		// Collect all dependency names from all providers
		const allDependencies = new Set<string>();
		for (const provider of context.providers.values()) {
			for (const dep of provider.dependencies) {
				allDependencies.add(dep);
			}
		}

		// Also collect controller dependencies
		for (const filePath of context.files) {
			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				if (!cls.getDecorator("Controller")) {
					continue;
				}
				const ctor = cls.getConstructors()[0];
				if (!ctor) {
					continue;
				}
				for (const param of ctor.getParameters()) {
					const typeText = param.getType().getText();
					const simpleName =
						typeText.split(".").pop()?.split("<")[0] ?? typeText;
					allDependencies.add(simpleName);
				}
			}
		}

		for (const provider of context.providers.values()) {
			const name = provider.name;

			// Skip common infrastructure patterns
			if (SKIP_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
				continue;
			}

			// Skip if it's used as a dependency somewhere
			if (allDependencies.has(name)) {
				continue;
			}

			// Skip if it's in module exports (it may be used externally)
			let isExported = false;
			for (const mod of context.moduleGraph.modules.values()) {
				if (mod.exports.includes(name)) {
					isExported = true;
					break;
				}
			}
			if (isExported) {
				continue;
			}

			context.report({
				filePath: provider.filePath,
				message: `Provider '${name}' is never injected by any other provider or controller.`,
				help: this.meta.help,
				line: provider.classDeclaration.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
