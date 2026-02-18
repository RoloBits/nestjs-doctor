import { isService } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const DOTTED_SUFFIX_REGEX = /\.(\w+)$/;
const GENERIC_TYPE_REGEX = /^(\w+)</;

const ORM_TYPES = new Set([
	"PrismaService",
	"PrismaClient",
	"EntityManager",
	"DataSource",
	"Connection",
	"MikroORM",
]);

export const noOrmInServices: Rule = {
	meta: {
		id: "architecture/no-orm-in-services",
		category: "architecture",
		severity: "warning",
		description:
			"Services should use repository abstractions instead of ORM directly",
		help: "Create a repository class that wraps ORM calls and inject that instead.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isService(cls)) {
				continue;
			}

			// Skip classes that are themselves repositories
			const className = cls.getName() ?? "";
			if (className.endsWith("Repository") || className.endsWith("Repo")) {
				continue;
			}

			const ctor = cls.getConstructors()[0];
			if (!ctor) {
				continue;
			}

			for (const param of ctor.getParameters()) {
				const typeText = param.getType().getText();
				const typeName = extractTypeName(typeText);

				if (ORM_TYPES.has(typeName)) {
					const nameNode = param.getNameNode();
					context.report({
						filePath: context.filePath,
						message: `Service injects ORM type '${typeName}' directly. Consider using a repository abstraction.`,
						help: this.meta.help,
						line: nameNode.getStartLineNumber(),
						column: nameNode.getStartLinePos() + 1,
					});
				}

				// Check for @InjectRepository/@InjectModel
				for (const decorator of param.getDecorators()) {
					const name = decorator.getName();
					if (name === "InjectRepository" || name === "InjectModel") {
						context.report({
							filePath: context.filePath,
							message: `Service uses @${name}() directly. Consider wrapping in a repository class.`,
							help: this.meta.help,
							line: decorator.getStartLineNumber(),
							column: 1,
						});
					}
				}
			}
		}
	},
};

function extractTypeName(typeText: string): string {
	const match = typeText.match(DOTTED_SUFFIX_REGEX);
	if (match) {
		return match[1];
	}
	const genericMatch = typeText.match(GENERIC_TYPE_REGEX);
	if (genericMatch) {
		return genericMatch[1];
	}
	return typeText;
}
