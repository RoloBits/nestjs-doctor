import {
	type ClassDeclaration,
	type Node,
	type Project,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";

const IMPLEMENTATION_KEYS = ["useClass", "useExisting"];

function declarationsOf(node: Node): Node[] {
	const identifier =
		node.asKind(SyntaxKind.Identifier) ??
		node.asKind(SyntaxKind.PropertyAccessExpression)?.getNameNode();
	if (!identifier) {
		return [];
	}
	const definitions = identifier.getDefinitionNodes();
	if (definitions.length > 0) {
		return definitions;
	}
	const symbol = identifier.getSymbol();
	return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

function classOf(
	node: Node,
	scannedFiles: ReadonlySet<SourceFile>
): ClassDeclaration | undefined {
	for (const declaration of declarationsOf(node)) {
		const cls = declaration.asKind(SyntaxKind.ClassDeclaration);
		if (cls && scannedFiles.has(cls.getSourceFile())) {
			return cls;
		}
	}
	return undefined;
}

function collectFromProviderValue(
	node: Node,
	scannedFiles: ReadonlySet<SourceFile>,
	classes: Set<ClassDeclaration>,
	visited: Set<Node>
): void {
	if (visited.has(node)) {
		return;
	}
	visited.add(node);

	const expressions = node.getDescendantsOfKind(SyntaxKind.NewExpression);
	const directExpression = node.asKind(SyntaxKind.NewExpression);
	if (directExpression) {
		expressions.unshift(directExpression);
	}
	for (const expression of expressions) {
		const cls = classOf(expression.getExpression(), scannedFiles);
		if (cls) {
			classes.add(cls);
		}
	}

	const references = [
		node,
		...node.getDescendantsOfKind(SyntaxKind.Identifier),
	];
	for (const reference of references) {
		for (const declaration of declarationsOf(reference)) {
			if (!scannedFiles.has(declaration.getSourceFile())) {
				continue;
			}
			const value =
				declaration.asKind(SyntaxKind.VariableDeclaration)?.getInitializer() ??
				declaration.asKind(SyntaxKind.PropertyDeclaration)?.getInitializer() ??
				declaration.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
				declaration.asKind(SyntaxKind.FunctionDeclaration) ??
				declaration.asKind(SyntaxKind.MethodDeclaration) ??
				declaration.asKind(SyntaxKind.GetAccessor) ??
				declaration.asKind(SyntaxKind.ExportAssignment)?.getExpression();
			if (value) {
				collectFromProviderValue(value, scannedFiles, classes, visited);
			}
		}
	}
}

export function collectCustomProviderClasses(
	project: Project,
	files: string[]
): {
	implementationNames: Set<string>;
	constructedClasses: Set<ClassDeclaration>;
} {
	const scannedFiles = new Set<SourceFile>();
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (sourceFile) {
			scannedFiles.add(sourceFile);
		}
	}
	const implementationNames = new Set<string>();
	const constructedClasses = new Set<ClassDeclaration>();
	const visited = new Set<Node>();

	for (const sourceFile of scannedFiles) {
		for (const obj of sourceFile.getDescendantsOfKind(
			SyntaxKind.ObjectLiteralExpression
		)) {
			if (!obj.getProperty("provide")) {
				continue;
			}
			for (const key of IMPLEMENTATION_KEYS) {
				const initializer = obj
					.getProperty(key)
					?.asKind(SyntaxKind.PropertyAssignment)
					?.getInitializer();
				if (initializer) {
					implementationNames.add(initializer.getText());
				}
			}
			for (const key of ["useFactory", "useValue"]) {
				const property = obj.getProperty(key);
				const value =
					property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
					property?.asKind(SyntaxKind.MethodDeclaration) ??
					property
						?.asKind(SyntaxKind.ShorthandPropertyAssignment)
						?.getNameNode();
				if (value) {
					collectFromProviderValue(
						value,
						scannedFiles,
						constructedClasses,
						visited
					);
				}
			}
		}
	}

	return { implementationNames, constructedClasses };
}

/** Names appearing in an `extends` clause — a base class is used by its subclasses. */
export function collectExtendedClasses(
	project: Project,
	files: string[]
): Set<string> {
	const extended = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		for (const cls of sourceFile.getClasses()) {
			const base = cls.getExtends()?.getExpression().getText();
			if (base) {
				extended.add(base.split("<")[0].split(".").pop() ?? base);
			}
		}
	}

	return extended;
}
