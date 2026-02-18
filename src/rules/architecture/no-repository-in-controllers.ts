import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const REPOSITORY_PATTERNS = [
	/Repository$/,
	/Repo$/,
];

export const noRepositoryInControllers: Rule = {
	meta: {
		id: "architecture/no-repository-in-controllers",
		category: "architecture",
		severity: "error",
		description:
			"Controllers must not inject repositories directly — use the service layer",
		help: "Move database access to a service and inject the service into the controller instead.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) continue;

			const ctor = cls.getConstructors()[0];
			if (!ctor) continue;

			for (const param of ctor.getParameters()) {
				const typeText = param.getType().getText();
				const typeName = extractTypeName(typeText);

				if (REPOSITORY_PATTERNS.some((p) => p.test(typeName))) {
					const nameNode = param.getNameNode();
					context.report({
						filePath: context.filePath,
						message: `Controller injects repository '${typeName}' directly. Use a service layer instead.`,
						help: this.meta.help,
						line: nameNode.getStartLineNumber(),
						column: nameNode.getStartLinePos() + 1,
					});
				}
			}

			// Also check import declarations for repository imports
			for (const imp of context.sourceFile.getImportDeclarations()) {
				const moduleSpecifier = imp.getModuleSpecifierValue();
				if (
					moduleSpecifier.includes("/repositories/") ||
					moduleSpecifier.includes("/repositories")
				) {
					context.report({
						filePath: context.filePath,
						message: `Controller imports from repository path '${moduleSpecifier}'.`,
						help: this.meta.help,
						line: imp.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};

function extractTypeName(typeText: string): string {
	// Handle import("...").ClassName patterns from ts-morph
	const match = typeText.match(/\.(\w+)$/);
	if (match) return match[1];
	// Handle generic types like Repository<User>
	const genericMatch = typeText.match(/^(\w+)</);
	if (genericMatch) return genericMatch[1];
	return typeText;
}
