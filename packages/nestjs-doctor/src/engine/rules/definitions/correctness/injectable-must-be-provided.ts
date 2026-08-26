import {
	collectCustomProviderClasses,
	collectExtendedClasses,
	isTestFile,
} from "../../../graph/custom-providers.js";
import { INFRA_SUFFIXES } from "../../constants.js";
import type { ProjectRule } from "../../types.js";

export const injectableMustBeProvided: ProjectRule = {
	meta: {
		id: "correctness/injectable-must-be-provided",
		category: "correctness",
		severity: "info",
		tags: ["module-graph"],
		description:
			"@Injectable() classes should be registered in at least one module's providers array",
		help: "Add this class to a module's providers array, or remove the @Injectable() decorator if unused.",
		scope: "project",
	},

	check(context) {
		// Collect all provider names registered in module metadata
		const registeredProviders = new Set<string>();
		for (const mod of context.moduleGraph.modules.values()) {
			for (const provider of mod.providers) {
				registeredProviders.add(provider);
			}
			for (const controller of mod.controllers) {
				registeredProviders.add(controller);
			}
		}

		const productionFiles = context.files.filter(
			(filePath) => !isTestFile(filePath)
		);
		const customProviderClasses = collectCustomProviderClasses(
			context.project,
			productionFiles
		);
		for (const name of customProviderClasses.implementationNames) {
			registeredProviders.add(name);
		}

		// A base class is registered through its subclasses, not on its own. Test
		// files are left out so a stub cannot exempt a production class.
		const extended = collectExtendedClasses(context.project, productionFiles);

		// Scan all files for @Injectable() classes
		for (const filePath of context.files) {
			if (isTestFile(filePath)) {
				continue;
			}

			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				const injectableDecorator = cls.getDecorator("Injectable");
				if (!injectableDecorator) {
					continue;
				}

				const className = cls.getName();
				if (!className) {
					continue;
				}

				// Skip infrastructure classes (guards, interceptors, etc.)
				if (INFRA_SUFFIXES.some((suffix) => className.endsWith(suffix))) {
					continue;
				}

				// Skip if registered in any module
				if (
					registeredProviders.has(className) ||
					customProviderClasses.constructedClasses.has(cls)
				) {
					continue;
				}

				// Skip a base class: its subclasses carry the registration.
				if (extended.has(className)) {
					continue;
				}

				context.report({
					filePath,
					message: `@Injectable() class '${className}' is not registered in any module's providers array.`,
					help: this.meta.help,
					line: cls.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
