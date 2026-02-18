import type { Rule } from "../types.js";

// Detect deep imports into other feature modules' internals
// e.g., import { Foo } from '../users/repositories/users.repository'
const INTERNAL_PATHS = [
	"/repositories/",
	"/entities/",
	"/dto/",
	"/guards/",
	"/interceptors/",
	"/pipes/",
	"/strategies/",
];

export const requireModuleBoundaries: Rule = {
	meta: {
		id: "architecture/require-module-boundaries",
		category: "architecture",
		severity: "info",
		description: "Avoid deep imports into other feature modules' internals",
		help: "Import from the module's public API (barrel export) instead of reaching into its internals.",
	},

	check(context) {
		for (const imp of context.sourceFile.getImportDeclarations()) {
			const moduleSpecifier = imp.getModuleSpecifierValue();

			// Only check relative imports
			if (!moduleSpecifier.startsWith(".")) {
				continue;
			}

			// Check if the import reaches into another module's internals
			// Pattern: going up (../) then into another feature's subdirectory
			if (!moduleSpecifier.includes("../")) {
				continue;
			}

			const crossesModuleBoundary = INTERNAL_PATHS.some((p) =>
				moduleSpecifier.includes(p)
			);

			if (crossesModuleBoundary) {
				context.report({
					filePath: context.filePath,
					message: `Import '${moduleSpecifier}' reaches into another module's internals.`,
					help: this.meta.help,
					line: imp.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
