import { extractSimpleTypeName } from "../../../graph/type-resolver.js";
import { isService } from "../../../nest-class-inspector.js";
import type { Rule } from "../../types.js";

// Note: `Repository` (TypeORM) AND `EntityRepository` (MikroORM) are
// INTENTIONALLY excluded — services can legitimately wrap a repository (the
// repository pattern itself). The class-name guard below also skips classes
// named `*Repository`/`*Repo`, so a repo implementation won't be flagged for
// injecting ORM types either. Both rules above and below should remain
// symmetric for the two ORMs' typed repository classes.
const ORM_TYPES = new Set([
	"PrismaService",
	"PrismaClient",
	"EntityManager",
	"DataSource",
	"Connection",
	"MongooseModel",
	"MikroORM",
	"DrizzleService",
]);

export const noOrmInServices: Rule = {
	meta: {
		id: "architecture/no-orm-in-services",
		category: "architecture",
		severity: "info",
		description:
			"Services should use repository abstractions instead of ORM directly",
		help: "Create a repository class that wraps ORM calls and inject that instead. Note: If your project follows the official NestJS Prisma recipe (injecting PrismaService directly), you can disable this rule.",
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
				const typeName = extractSimpleTypeName(typeText);

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
					if (
						name === "InjectRepository" ||
						name === "InjectModel" ||
						name === "InjectEntityManager"
					) {
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
