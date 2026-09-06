import {
	type ClassDeclaration,
	Node,
	type ObjectLiteralExpression,
	type Project,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";

/** Keys whose value names a class. */
const CLASS_REFERENCE_KEYS = ["provide", "useClass", "useExisting"];
/** Keys whose value is an instance; only `new X()` counts. */
const INSTANCE_KEYS = ["useFactory", "useValue"];

export function isTestFile(filePath: string): boolean {
	return (
		filePath.includes(".spec.") ||
		filePath.includes(".test.") ||
		filePath.includes("__test__") ||
		filePath.includes("__tests__")
	);
}

function isExternal(sourceFile: SourceFile): boolean {
	return sourceFile.isDeclarationFile() || sourceFile.isInNodeModules();
}

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

function classOf(node: Node): ClassDeclaration | undefined {
	for (const declaration of declarationsOf(node)) {
		const cls = declaration.asKind(SyntaxKind.ClassDeclaration);
		if (cls && !isExternal(cls.getSourceFile())) {
			return cls;
		}
	}
	return undefined;
}

/** The expression a declaration evaluates to; nothing for external declarations. */
function declaredValue(declaration: Node): Node | undefined {
	if (isExternal(declaration.getSourceFile())) {
		return undefined;
	}
	return (
		declaration.asKind(SyntaxKind.VariableDeclaration)?.getInitializer() ??
		declaration.asKind(SyntaxKind.PropertyDeclaration)?.getInitializer() ??
		declaration.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
		declaration.asKind(SyntaxKind.FunctionDeclaration) ??
		declaration.asKind(SyntaxKind.MethodDeclaration) ??
		declaration.asKind(SyntaxKind.GetAccessor) ??
		declaration.asKind(SyntaxKind.ExportAssignment)?.getExpression()
	);
}

/**
 * One step from an expression toward the values it can evaluate to.
 *
 * @example
 * // `useClass: isProd ? pick() : Impl` yields `pick()` and `Impl`;
 * // `pick()` yields `pick` and its arguments; `pick` yields the function
 * // declaration; the declaration yields the expression of each `return`.
 */
function possibleValuesOf(node: Node): Node[] {
	if (
		Node.isParenthesizedExpression(node) ||
		Node.isAsExpression(node) ||
		Node.isSatisfiesExpression(node) ||
		Node.isNonNullExpression(node) ||
		Node.isTypeAssertion(node) ||
		Node.isAwaitExpression(node)
	) {
		return [node.getExpression()];
	}
	if (Node.isConditionalExpression(node)) {
		return [node.getWhenTrue(), node.getWhenFalse()];
	}
	if (Node.isBinaryExpression(node)) {
		return [node.getLeft(), node.getRight()];
	}
	if (Node.isCallExpression(node)) {
		return [node.getExpression(), ...node.getArguments()];
	}
	if (Node.isElementAccessExpression(node)) {
		return [node.getExpression()];
	}
	if (Node.isClassExpression(node)) {
		const base = node.getExtends()?.getExpression();
		return base ? [base] : [];
	}
	if (Node.isObjectLiteralExpression(node)) {
		return node.getProperties().flatMap((property) => {
			const value =
				property.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
				property.asKind(SyntaxKind.ShorthandPropertyAssignment)?.getNameNode();
			return value ? [value] : [];
		});
	}
	if (Node.isArrayLiteralExpression(node)) {
		return node.getElements();
	}
	if (Node.isArrowFunction(node) && !Node.isBlock(node.getBody())) {
		return [node.getBody()];
	}
	if (Node.isFunctionLikeDeclaration(node)) {
		return node
			.getDescendantsOfKind(SyntaxKind.ReturnStatement)
			.filter(
				(statement) =>
					statement.getFirstAncestor(Node.isFunctionLikeDeclaration) === node
			)
			.flatMap((statement) => {
				const expression = statement.getExpression();
				return expression ? [expression] : [];
			});
	}
	if (Node.isIdentifier(node) || Node.isPropertyAccessExpression(node)) {
		return declarationsOf(node).flatMap((declaration) => {
			const value = declaredValue(declaration);
			return value ? [value] : [];
		});
	}
	return [];
}

/**
 * Adds every class a `provide`, `useClass` or `useExisting` value can
 * evaluate to, following `possibleValuesOf` until a class is reached.
 *
 * @example
 * // function providerFactory() { return AppService; }
 * // { provide: 'TOK', useClass: providerFactory() }   -> AppService
 * // { provide: 'TOK', useClass: flag ? Smtp : Fake } -> Smtp, Fake
 * // A class the helper only calls, `Logger.log()`, is not reached.
 */
function collectClassReferences(
	node: Node,
	classes: Set<ClassDeclaration>,
	visited: Set<Node>
): void {
	if (visited.has(node)) {
		return;
	}
	visited.add(node);

	const cls = classOf(node);
	if (cls) {
		classes.add(cls);
		return;
	}
	for (const value of possibleValuesOf(node)) {
		collectClassReferences(value, classes, visited);
	}
}

/** Classes constructed with `new` anywhere reachable from a factory or value. */
function collectConstructedClasses(
	node: Node,
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
		const cls = classOf(expression.getExpression());
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
			const value = declaredValue(declaration);
			if (value) {
				collectConstructedClasses(value, classes, visited);
			}
		}
	}
}

function providerValue(
	obj: ObjectLiteralExpression,
	key: string
): Node | undefined {
	const property = obj.getProperty(key);
	return (
		property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
		property?.asKind(SyntaxKind.MethodDeclaration) ??
		property?.asKind(SyntaxKind.ShorthandPropertyAssignment)?.getNameNode()
	);
}

/**
 * Classes registered by the object-literal providers found in `files`.
 * `constructedClasses` holds resolved classes declared in `files`; a class
 * declared elsewhere, and the raw `useClass`/`useExisting` text, go by name.
 * `targetsByFile` lists each file's own `useClass`/`useExisting` targets.
 *
 * @example
 * // app.module.ts: { provide: 'MAILER', useClass: pickMailer() }
 * // pick.ts:       export function pickMailer() { return SmtpMailer; }
 * // with files = ['app.module.ts', 'pick.ts', 'smtp.mailer.ts']:
 * //   constructedClasses = { SmtpMailer declaration }
 * //   implementationNames = { 'pickMailer()' }
 * //   targetsByFile.get(app.module.ts) = { 'pickMailer()', 'SmtpMailer' }
 */
export function collectCustomProviderClasses(
	project: Project,
	files: string[]
): {
	implementationNames: Set<string>;
	constructedClasses: Set<ClassDeclaration>;
	targetsByFile: Map<SourceFile, Set<string>>;
} {
	const scannedFiles = new Set<SourceFile>();
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (sourceFile) {
			scannedFiles.add(sourceFile);
		}
	}
	const implementationNames = new Set<string>();
	const resolvedClasses = new Set<ClassDeclaration>();
	const targetsByFile = new Map<SourceFile, Set<string>>();
	const visitedForInstances = new Set<Node>();

	for (const sourceFile of scannedFiles) {
		const targets = new Set<string>();
		targetsByFile.set(sourceFile, targets);
		for (const obj of sourceFile.getDescendantsOfKind(
			SyntaxKind.ObjectLiteralExpression
		)) {
			if (!obj.getProperty("provide")) {
				continue;
			}
			for (const key of CLASS_REFERENCE_KEYS) {
				const value = providerValue(obj, key);
				if (!value) {
					continue;
				}
				const references = new Set<ClassDeclaration>();
				collectClassReferences(value, references, new Set());
				for (const cls of references) {
					resolvedClasses.add(cls);
				}
				if (key === "provide") {
					continue;
				}
				implementationNames.add(value.getText());
				targets.add(value.getText());
				for (const cls of references) {
					const name = cls.getName();
					if (name) {
						targets.add(name);
					}
				}
			}
			for (const key of INSTANCE_KEYS) {
				const value = providerValue(obj, key);
				if (value) {
					collectConstructedClasses(
						value,
						resolvedClasses,
						visitedForInstances
					);
				}
			}
		}
	}

	const constructedClasses = new Set<ClassDeclaration>();
	for (const cls of resolvedClasses) {
		if (scannedFiles.has(cls.getSourceFile())) {
			constructedClasses.add(cls);
		} else {
			const name = cls.getName();
			if (name) {
				implementationNames.add(name);
			}
		}
	}

	return { implementationNames, constructedClasses, targetsByFile };
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
