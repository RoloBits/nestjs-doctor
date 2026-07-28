import { type Project, SyntaxKind } from "ts-morph";

const FACTORY_METHODS = new Set([
	"create",
	"createApplicationContext",
	"createMicroservice",
]);

/**
 * Module names handed to NestFactory. An application root is never imported by
 * another module, and a project may bootstrap several.
 */
export function collectBootstrappedModules(
	project: Project,
	files: string[]
): Set<string> {
	const roots = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		for (const call of sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		)) {
			const callee = call
				.getExpression()
				.asKind(SyntaxKind.PropertyAccessExpression);
			if (!callee) {
				continue;
			}
			if (!FACTORY_METHODS.has(callee.getName())) {
				continue;
			}
			if (!callee.getExpression().getText().endsWith("NestFactory")) {
				continue;
			}

			const target = call.getArguments()[0];
			if (target?.getKind() === SyntaxKind.Identifier) {
				roots.add(target.getText());
			}
		}
	}

	return roots;
}
