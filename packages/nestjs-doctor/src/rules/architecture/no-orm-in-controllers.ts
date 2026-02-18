import { isController } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

const DOTTED_SUFFIX_REGEX = /\.(\w+)$/;
const GENERIC_TYPE_REGEX = /^(\w+)</;

const ORM_TYPES = new Set([
	"PrismaService",
	"PrismaClient",
	"EntityManager",
	"DataSource",
	"Repository",
	"Connection",
	"MongooseModel",
	"InjectModel",
	"InjectRepository",
	"MikroORM",
	"DrizzleService",
]);

export const noOrmInControllers: Rule = {
	meta: {
		id: "architecture/no-orm-in-controllers",
		category: "architecture",
		severity: "error",
		description:
			"Controllers must not inject ORM services directly — use a service layer",
		help: "Inject a service that wraps the ORM instead of using the ORM directly in controllers.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isController(cls)) {
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
						message: `Controller injects ORM type '${typeName}' directly. Use a service layer.`,
						help: this.meta.help,
						line: nameNode.getStartLineNumber(),
						column: nameNode.getStartLinePos() + 1,
					});
				}
			}

			// Check for ORM-related decorator injections (@InjectRepository, @InjectModel)
			for (const param of cls.getConstructors()[0]?.getParameters() ?? []) {
				for (const decorator of param.getDecorators()) {
					const name = decorator.getName();
					if (name === "InjectRepository" || name === "InjectModel") {
						context.report({
							filePath: context.filePath,
							message: `Controller uses @${name}() decorator. Move data access to a service.`,
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
