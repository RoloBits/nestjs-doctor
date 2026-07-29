import { posixDirname } from "../../../graph/module-graph.js";
import type { Rule } from "../../types.js";

const INTERNAL_PATTERNS = [
	/Repository$/,
	/\.repository$/,
	/\.entity$/,
	/\.schema$/,
	/\.guard$/,
	/\.interceptor$/,
	/\.pipe$/,
	/\.filter$/,
	/\.strategy$/,
];

export const noBarrelExportInternals: Rule = {
	meta: {
		id: "architecture/no-barrel-export-internals",
		category: "architecture",
		severity: "info",
		description:
			"Don't re-export internal implementation details from a module's barrel file",
		help: "Only export the module's public API (services, DTOs, interfaces) from the index.ts beside its module file.",
	},

	check(context) {
		// Only check barrel files (index.ts)
		if (!context.filePath.endsWith("/index.ts")) {
			return;
		}

		// Only a barrel beside a module file is that module's public surface.
		// An empty set means no module was found, not that nothing is one.
		const directories = context.moduleDirectories;
		if (directories?.size && !directories.has(posixDirname(context.filePath))) {
			return;
		}

		for (const exportDecl of context.sourceFile.getExportDeclarations()) {
			const moduleSpecifier = exportDecl.getModuleSpecifierValue();
			if (!moduleSpecifier) {
				continue;
			}

			const isInternal = INTERNAL_PATTERNS.some((p) => p.test(moduleSpecifier));

			if (isInternal) {
				context.report({
					filePath: context.filePath,
					message: `Barrel file re-exports internal module '${moduleSpecifier}'.`,
					help: this.meta.help,
					line: exportDecl.getStartLineNumber(),
					column: 1,
				});
			}

			// Also check named exports that reference internal types
			for (const namedExport of exportDecl.getNamedExports()) {
				const name = namedExport.getName();
				if (
					name.endsWith("Repository") ||
					name.endsWith("Entity") ||
					name.endsWith("Schema")
				) {
					context.report({
						filePath: context.filePath,
						message: `Barrel file re-exports internal type '${name}'.`,
						help: this.meta.help,
						line: namedExport.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
