import { posixDirname, resolvePosix } from "../../../graph/module-graph.js";
import type { Rule } from "../../types.js";

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

/** The deepest module directory containing `path`, if any is known. */
function nearestModuleDirectory(
	path: string,
	directories: ReadonlySet<string>
): string | undefined {
	let nearest: string | undefined;
	for (const directory of directories) {
		const prefix = directory === "/" ? "/" : `${directory}/`;
		if (
			path.startsWith(prefix) &&
			(nearest === undefined || directory.length > nearest.length)
		) {
			nearest = directory;
		}
	}
	return nearest;
}

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
			if (!crossesModuleBoundary) {
				continue;
			}

			// An import that stays inside its own module crosses nothing.
			const directories = context.moduleDirectories;
			if (directories) {
				const target = resolvePosix(
					posixDirname(context.filePath),
					moduleSpecifier
				);
				const sourceModule = nearestModuleDirectory(
					context.filePath,
					directories
				);
				const targetModule = nearestModuleDirectory(target, directories);
				if (sourceModule !== undefined && sourceModule === targetModule) {
					continue;
				}
			}
			context.report({
				filePath: context.filePath,
				message: `Import '${moduleSpecifier}' reaches into another module's internals.`,
				help: this.meta.help,
				line: imp.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
