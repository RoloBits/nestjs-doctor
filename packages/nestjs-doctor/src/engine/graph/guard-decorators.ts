import type { Node, Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** Decorator names that compose `UseGuards`, keyed by the file declaring them. */
export type GuardDecoratorIndex = Map<string, Set<string>>;

const FUNCTION_KINDS = new Set([
	SyntaxKind.ArrowFunction,
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.FunctionExpression,
	SyntaxKind.MethodDeclaration,
]);

function isUseGuardsCall(node: Node): boolean {
	return (
		node.asKind(SyntaxKind.CallExpression)?.getExpression().getText() ===
		"UseGuards"
	);
}

/**
 * True for an argument that always applies a guard. A ternary counts only when
 * both of its branches do, so a decorator guarding one way round does not.
 */
function argumentApplies(argument: Node): boolean {
	if (isUseGuardsCall(argument)) {
		return true;
	}
	const conditional = argument.asKind(SyntaxKind.ConditionalExpression);
	if (conditional) {
		return (
			argumentApplies(conditional.getWhenTrue()) &&
			argumentApplies(conditional.getWhenFalse())
		);
	}
	const spread = argument.asKind(SyntaxKind.SpreadElement);
	const elements = spread
		?.getExpression()
		.asKind(SyntaxKind.ArrayLiteralExpression)
		?.getElements();
	return elements ? elements.some(argumentApplies) : false;
}

/** True for `applyDecorators(..., UseGuards(...), ...)`. */
function appliesGuards(expression: Node | undefined): boolean {
	const call = expression?.asKind(SyntaxKind.CallExpression);
	if (call?.getExpression().getText() !== "applyDecorators") {
		return false;
	}
	return call.getArguments().some(argumentApplies);
}

/**
 * Expressions `fn` itself hands back. Returns belonging to a nested function
 * are skipped, since they say nothing about what `fn` returns.
 */
function returnedExpressions(fn: Node): Node[] {
	const body = fn.getChildrenOfKind(SyntaxKind.Block)[0];
	if (!body) {
		const arrow = fn.asKind(SyntaxKind.ArrowFunction);
		const concise = arrow?.getBody();
		return concise && !concise.isKind(SyntaxKind.Block) ? [concise] : [];
	}

	const expressions: Node[] = [];
	for (const statement of body.getDescendantsOfKind(
		SyntaxKind.ReturnStatement
	)) {
		const owner = statement.getFirstAncestor((ancestor) =>
			FUNCTION_KINDS.has(ancestor.getKind())
		);
		if (owner !== fn) {
			continue;
		}
		const expression = statement.getExpression();
		if (expression) {
			expressions.push(expression);
		}
	}
	return expressions;
}

/** Names in one file whose implementation composes `UseGuards`. */
function namesInFile(sourceFile: SourceFile): Set<string> {
	const names = new Set<string>();

	for (const fn of sourceFile.getFunctions()) {
		const name = fn.getName();
		if (name && returnedExpressions(fn).some(appliesGuards)) {
			names.add(name);
		}
	}

	for (const declaration of sourceFile.getVariableDeclarations()) {
		const arrow = declaration
			.getInitializer()
			?.asKind(SyntaxKind.ArrowFunction);
		if (arrow && returnedExpressions(arrow).some(appliesGuards)) {
			names.add(declaration.getName());
		}
	}

	return names;
}

export function buildGuardDecoratorIndex(
	project: Project,
	files: string[]
): GuardDecoratorIndex {
	const index: GuardDecoratorIndex = new Map();
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (sourceFile) {
			index.set(filePath, namesInFile(sourceFile));
		}
	}
	return index;
}

/** Rescans one file, dropping whatever it declared before. */
export function updateGuardDecoratorIndexForFile(
	index: GuardDecoratorIndex,
	project: Project,
	filePath: string
): void {
	const sourceFile = project.getSourceFile(filePath);
	if (sourceFile) {
		index.set(filePath, namesInFile(sourceFile));
		return;
	}
	index.delete(filePath);
}

export function guardDecoratorNames(
	index: GuardDecoratorIndex
): ReadonlySet<string> {
	const names = new Set<string>();
	for (const fileNames of index.values()) {
		for (const name of fileNames) {
			names.add(name);
		}
	}
	return names;
}
