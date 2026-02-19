import type { ProjectRule } from "../types.js";

export const noUnusedModuleExports: ProjectRule = {
	meta: {
		id: "performance/no-unused-module-exports",
		category: "performance",
		severity: "info",
		description:
			"Module exports a provider that no importing module actually uses",
		help: "Remove the unused export or use the provider in an importing module.",
		scope: "project",
	},

	check(context) {
		// For each module, check if its exports are actually used by importing modules
		for (const mod of context.moduleGraph.modules.values()) {
			if (mod.exports.length === 0) {
				continue;
			}

			// Find modules that import this one
			const importingModules: string[] = [];
			for (const otherMod of context.moduleGraph.modules.values()) {
				if (otherMod.name === mod.name) {
					continue;
				}
				if (otherMod.imports.includes(mod.name)) {
					importingModules.push(otherMod.name);
				}
			}

			// If no module imports this one, all exports are unused
			if (importingModules.length === 0) {
				continue; // no-orphan-modules handles this case
			}

			// Collect all provider dependencies from importing modules
			const usedProviders = new Set<string>();
			for (const importerName of importingModules) {
				const importer = context.moduleGraph.modules.get(importerName);
				if (!importer) {
					continue;
				}

				// Check which providers in the importing module depend on exported providers
				for (const providerName of importer.providers) {
					const provider = context.providers.get(providerName);
					if (!provider) {
						continue;
					}
					for (const dep of provider.dependencies) {
						usedProviders.add(dep);
					}
				}

				// If the importing module re-exports this module, all exports are "used"
				if (importer.exports.includes(mod.name)) {
					for (const exp of mod.exports) {
						usedProviders.add(exp);
					}
				}

				// Check controllers too
				for (const controllerName of importer.controllers) {
					for (const filePath of context.files) {
						const sourceFile = context.project.getSourceFile(filePath);
						if (!sourceFile) {
							continue;
						}
						for (const cls of sourceFile.getClasses()) {
							if (cls.getName() !== controllerName) {
								continue;
							}
							const ctor = cls.getConstructors()[0];
							if (!ctor) {
								continue;
							}
							for (const param of ctor.getParameters()) {
								const typeNode = param.getTypeNode();
								const typeText = typeNode
									? typeNode.getText()
									: param.getType().getText();
								const simpleName =
									typeText.split(".").pop()?.split("<")[0] ?? typeText;
								usedProviders.add(simpleName);
							}
						}
					}
				}
			}

			for (const exportedName of mod.exports) {
				// Skip module re-exports (e.g. CoreModule exports SharedModule)
				if (context.moduleGraph.modules.has(exportedName)) {
					continue;
				}
				if (!usedProviders.has(exportedName)) {
					context.report({
						filePath: mod.filePath,
						message: `Module '${mod.name}' exports '${exportedName}' but no importing module uses it.`,
						help: this.meta.help,
						line: mod.classDeclaration.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
