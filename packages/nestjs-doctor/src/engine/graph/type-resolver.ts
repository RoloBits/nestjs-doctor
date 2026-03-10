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

function extractProvidersFromFile(
	sourceFile: NonNullable<ReturnType<Project["getSourceFile"]>>,
	filePath: string
): ProviderInfo[] {
	const providers: ProviderInfo[] = [];
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

		providers.push({
			name,
			filePath,
			classDeclaration: cls,
			dependencies,
			publicMethodCount,
		});
	}
	return providers;
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

		for (const info of extractProvidersFromFile(sourceFile, filePath)) {
			providers.set(info.name, info);
		}
	}

	return providers;
}

export function updateProvidersForFile(
	providers: Map<string, ProviderInfo>,
	project: Project,
	filePath: string
): void {
	// 1. Remove stale providers from this file
	for (const [name, info] of providers) {
		if (info.filePath === filePath) {
			providers.delete(name);
		}
	}

	// 2. Re-scan only the changed file for @Injectable() classes
	const sourceFile = project.getSourceFile(filePath);
	if (!sourceFile) {
		return;
	}

	for (const info of extractProvidersFromFile(sourceFile, filePath)) {
		providers.set(info.name, info);
	}
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
