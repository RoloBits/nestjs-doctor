import type { Decorator, Node, Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { YIELD_INTERVAL, yieldToEventLoop } from "../yield.js";

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
 * True for an argument that always applies a guard: the call itself, a ternary
 * whose both branches do, or a spread of an inline array holding one.
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

/** True for `UseGuards(...)` itself, or an `applyDecorators(...)` that applies one. */
function appliesGuards(expression: Node | undefined): boolean {
	if (!expression) {
		return false;
	}
	if (isUseGuardsCall(expression)) {
		return true;
	}
	const call = expression.asKind(SyntaxKind.CallExpression);
	if (call?.getExpression().getText() !== "applyDecorators") {
		return false;
	}
	return call.getArguments().some(argumentApplies);
}

/**
 * What `fn` itself hands back, one entry per return, `undefined` for a bare
 * one. Returns belonging to a nested function are skipped, since they say
 * nothing about what `fn` returns.
 */
function returnedExpressions(fn: Node): (Node | undefined)[] {
	const body = fn.getChildrenOfKind(SyntaxKind.Block)[0];
	if (!body) {
		const arrow = fn.asKind(SyntaxKind.ArrowFunction);
		const concise = arrow?.getBody();
		return concise && !concise.isKind(SyntaxKind.Block) ? [concise] : [];
	}

	const expressions: (Node | undefined)[] = [];
	for (const statement of body.getDescendantsOfKind(
		SyntaxKind.ReturnStatement
	)) {
		const owner = statement.getFirstAncestor((ancestor) =>
			FUNCTION_KINDS.has(ancestor.getKind())
		);
		if (owner !== fn) {
			continue;
		}
		expressions.push(statement.getExpression());
	}
	return expressions;
}

/** True when every path out of `fn` returns a guard, and there is at least one. */
function functionAppliesGuards(fn: Node): boolean {
	const returns = returnedExpressions(fn);
	return returns.length > 0 && returns.every(appliesGuards);
}

/** The function a declaration implements: itself, or its initialiser. */
function declaredFunction(declaration: Node): Node | undefined {
	if (declaration.isKind(SyntaxKind.FunctionDeclaration)) {
		return declaration;
	}
	const initializer = declaration
		.asKind(SyntaxKind.VariableDeclaration)
		?.getInitializer();
	return (
		initializer?.asKind(SyntaxKind.ArrowFunction) ??
		initializer?.asKind(SyntaxKind.FunctionExpression)
	);
}

/** Verdicts keyed by the declaration node. */
const compositionCache = new WeakMap<Node, boolean>();

/**
 * True when this decorator's implementation applies a guard. Resolves the name
 * to its declaration through the type checker.
 */
export function decoratorAppliesGuards(decorator: Decorator): boolean {
	const symbol = decorator.getNameNode().getSymbol();
	const declarations = (
		symbol?.getAliasedSymbol() ?? symbol
	)?.getDeclarations();
	if (!declarations?.length) {
		return false;
	}
	const first = declarations[0];
	const cached = compositionCache.get(first);
	if (cached !== undefined) {
		return cached;
	}
	const applies = declarations.some((declaration) => {
		const fn = declaredFunction(declaration);
		return fn ? functionAppliesGuards(fn) : false;
	});
	compositionCache.set(first, applies);
	return applies;
}

/**
 * True when a decorator binds a guard: `@UseGuards`, a name the index already
 * knows, or a composition its declaration spells out.
 */
export function isGuardDecorator(
	decorator: Decorator,
	composed: ReadonlySet<string> | undefined
): boolean {
	const name = decorator.getName();
	return (
		name === "UseGuards" ||
		composed?.has(name) === true ||
		decoratorAppliesGuards(decorator)
	);
}

/** Names in one file whose implementation composes `UseGuards`. */
function namesInFile(sourceFile: SourceFile): Set<string> {
	const names = new Set<string>();

	for (const fn of sourceFile.getFunctions()) {
		const name = fn.getName();
		if (name && functionAppliesGuards(fn)) {
			names.add(name);
		}
	}

	for (const declaration of sourceFile.getVariableDeclarations()) {
		const fn = declaredFunction(declaration);
		if (fn && functionAppliesGuards(fn)) {
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

/** Batched variant of buildGuardDecoratorIndex; yields between files. */
export async function buildGuardDecoratorIndexAsync(
	project: Project,
	files: string[]
): Promise<GuardDecoratorIndex> {
	const index: GuardDecoratorIndex = new Map();
	for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
		const sourceFile = project.getSourceFile(files[fileIndex]);
		if (sourceFile) {
			index.set(files[fileIndex], namesInFile(sourceFile));
		}
		if ((fileIndex + 1) % YIELD_INTERVAL === 0) {
			await yieldToEventLoop();
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
