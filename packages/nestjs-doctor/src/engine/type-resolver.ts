import type { ClassDeclaration, Project } from "ts-morph";

const IMPORT_TYPE_REGEX = /import\([^)]+\)\.(\w+)/;
const GENERIC_TYPE_REGEX = /^(\w+)</;

export interface ProviderInfo {
	classDeclaration: ClassDeclaration;
	dependencies: string[];
	filePath: string;
	name: string;
	publicMethodCount: number;
}

export function resolveProviders(
	project: Project,
	files: string[]
): Map<string, ProviderInfo> {
	const providers = new Map<string, ProviderInfo>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		for (const cls of sourceFile.getClasses()) {
			if (!cls.getDecorator("Injectable")) {
				continue;
			}

			const name = cls.getName();
			if (!name) {
				continue;
			}

			const ctor = cls.getConstructors()[0];
			const dependencies = ctor
				? ctor.getParameters().map((p) => {
						const typeNode = p.getTypeNode();
						const typeText = typeNode
							? typeNode.getText()
							: p.getType().getText();
						return extractSimpleTypeName(typeText);
					})
				: [];

			const publicMethodCount = cls.getMethods().filter((m) => {
				const scope = m.getScope();
				// In TS, no modifier = public
				return !scope || scope === "public";
			}).length;

			providers.set(name, {
				name,
				filePath,
				classDeclaration: cls,
				dependencies,
				publicMethodCount,
			});
		}
	}

	return providers;
}

function extractSimpleTypeName(typeText: string): string {
	// Handle import("...").ClassName
	const importMatch = typeText.match(IMPORT_TYPE_REGEX);
	if (importMatch) {
		return importMatch[1];
	}
	// Handle generic types Repository<User>
	const genericMatch = typeText.match(GENERIC_TYPE_REGEX);
	if (genericMatch) {
		return genericMatch[1];
	}
	return typeText;
}
