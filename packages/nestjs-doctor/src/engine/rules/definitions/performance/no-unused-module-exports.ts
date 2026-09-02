import type { ClassDeclaration } from "ts-morph";
import { collectCustomProviderClasses } from "../../../graph/custom-providers.js";
import type { ModuleNode } from "../../../graph/module-graph.js";
import { hasDecorator } from "../../../nest-class-inspector.js";
import type { ProjectRule, ProjectRuleContext } from "../../types.js";

const QUOTES = /^['"`]|['"`]$/g;

/** Constructor parameter types plus any `@Inject(TOKEN)` argument. */
function collectInjectedNames(cls: ClassDeclaration, into: Set<string>): void {
	const ctor = cls.getConstructors()[0];
	if (!ctor) {
		return;
	}

	for (const param of ctor.getParameters()) {
		const typeNode = param.getTypeNode();
		const typeText = typeNode ? typeNode.getText() : param.getType().getText();
		into.add(typeText.split(".").pop()?.split("<")[0] ?? typeText);

		for (const decorator of param.getDecorators()) {
			if (decorator.getName() !== "Inject") {
				continue;
			}
			const token = decorator.getArguments()[0]?.getText();
			if (token) {
				into.add(token);
				into.add(token.replace(QUOTES, ""));
			}
		}
	}
}

/** Modules that can see this one's exports. A `@Global()` module is visible to all. */
function resolveConsumers(
	mod: ModuleNode,
	context: ProjectRuleContext
): ModuleNode[] {
	const all = [...context.moduleGraph.modules.values()].filter(
		(other) => other.name !== mod.name
	);

	if (mod.classDeclaration && hasDecorator(mod.classDeclaration, "Global")) {
		return all;
	}

	return all.filter((other) => other.imports.includes(mod.name));
}

export const noUnusedModuleExports: ProjectRule = {
	meta: {
		id: "performance/no-unused-module-exports",
		category: "performance",
		severity: "info",
		tags: ["module-graph"],
		description:
			"Module exports a provider that no importing module actually uses",
		help: "Remove the unused export or use the provider in an importing module.",
		scope: "project",
	},

	check(context) {
		const classesByName = new Map<string, ClassDeclaration>();
		for (const filePath of context.files) {
			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}
			for (const cls of sourceFile.getClasses()) {
				const name = cls.getName();
				if (name && !classesByName.has(name)) {
					classesByName.set(name, cls);
				}
			}
		}

		// Custom-provider implementation names per file, each file walked once.
		const implementationNamesByFile = new Map<string, Set<string>>();
		const implementationNamesIn = (filePath: string): Set<string> => {
			const cached = implementationNamesByFile.get(filePath);
			if (cached) {
				return cached;
			}
			const { implementationNames } = collectCustomProviderClasses(
				context.project,
				[filePath]
			);
			implementationNamesByFile.set(filePath, implementationNames);
			return implementationNames;
		};

		for (const mod of context.moduleGraph.modules.values()) {
			if (mod.exports.length === 0) {
				continue;
			}

			const consumers = resolveConsumers(mod, context);
			if (consumers.length === 0) {
				// no-orphan-modules handles a module nothing can reach
				continue;
			}

			const usedProviders = new Set<string>();
			for (const consumer of consumers) {
				for (const name of [...consumer.providers, ...consumer.controllers]) {
					const cls =
						context.providers.get(name)?.classDeclaration ??
						classesByName.get(name);
					if (cls) {
						collectInjectedNames(cls, usedProviders);
					}
				}

				// An object-literal provider (`{ provide, useClass }`) keeps its source
				// text; the target counts as used, and so does whatever it injects.
				for (const filePath of consumer.filePaths ?? [consumer.filePath]) {
					for (const implName of implementationNamesIn(filePath)) {
						usedProviders.add(implName);
						const implClass = classesByName.get(implName);
						if (implClass) {
							collectInjectedNames(implClass, usedProviders);
						}
					}
				}

				// A re-export makes every export reachable one level further out
				if (consumer.exports.includes(mod.name)) {
					for (const exported of mod.exports) {
						usedProviders.add(exported);
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
						line: mod.classDeclaration?.getStartLineNumber() ?? 1,
						column: 1,
					});
				}
			}
		}
	},
};
