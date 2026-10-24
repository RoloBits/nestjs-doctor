import { Node, SyntaxKind } from "ts-morph";

/** Expands only static arrays and bindings, never optional branches or calls. */
function staticEntries(
	value: Node | undefined,
	seen = new Set<Node>()
): Node[] {
	if (!value || seen.has(value)) {
		return [];
	}
	const visited = new Set(seen).add(value);
	if (Node.isIdentifier(value)) {
		const symbol = value.getSymbol();
		const declarations =
			(symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
		if (declarations.length > 1) {
			return [];
		}
		const variable = declarations[0]?.asKind(SyntaxKind.VariableDeclaration);
		return variable
			? staticEntries(variable.getInitializer(), visited)
			: [value];
	}
	if (Node.isArrayLiteralExpression(value)) {
		return value
			.getElements()
			.flatMap((entry) => staticEntries(entry, visited));
	}
	if (
		Node.isSpreadElement(value) ||
		Node.isParenthesizedExpression(value) ||
		Node.isAsExpression(value) ||
		Node.isSatisfiesExpression(value)
	) {
		return staticEntries(value.getExpression(), visited);
	}
	return Node.isObjectLiteralExpression(value) ? [value] : [];
}

/** Reads only statically present provider entries, not optional branches or calls. */
export function readProviderTokens(value: Node | undefined): string[] {
	return staticEntries(value).flatMap((entry) => {
		const token = entry
			.asKind(SyntaxKind.ObjectLiteralExpression)
			?.getProperty("provide")
			?.asKind(SyntaxKind.PropertyAssignment)
			?.getInitializer()
			?.getText();
		const name = token?.split(".").at(-1);
		return name ? [name] : [];
	});
}

/** Potential imports in a branch are not mandatory imports of every application. */
export function readRequiredImports(value: Node | undefined): string[] {
	return staticEntries(value)
		.filter(Node.isIdentifier)
		.map((entry) => entry.getText());
}
