import type { Node, Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** True for `applyDecorators(..., UseGuards(...), ...)`. */
function appliesGuards(expression: Node | undefined): boolean {
	const call = expression?.asKind(SyntaxKind.CallExpression);
	if (call?.getExpression().getText() !== "applyDecorators") {
		return false;
	}
	return call
		.getArguments()
		.some(
			(argument) =>
				argument
					.asKind(SyntaxKind.CallExpression)
					?.getExpression()
					.getText() === "UseGuards"
		);
}

/** Expressions a function body hands back, whether concise or via `return`. */
function returnedExpressions(body: Node | undefined): Node[] {
	if (!body) {
		return [];
	}
	if (!body.isKind(SyntaxKind.Block)) {
		return [body];
	}
	const expressions: Node[] = [];
	for (const statement of body.getDescendantsOfKind(
		SyntaxKind.ReturnStatement
	)) {
		const expression = statement.getExpression();
		if (expression) {
			expressions.push(expression);
		}
	}
	return expressions;
}

/**
 * Names of top-level functions that compose `UseGuards` into a decorator, so a
 * `@Auth()` built from `applyDecorators(UseGuards(...))` counts as a guard.
 */
export function buildGuardDecoratorNames(
	project: Project,
	files: string[]
): Set<string> {
	const names = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		for (const fn of sourceFile.getFunctions()) {
			const name = fn.getName();
			if (name && returnedExpressions(fn.getBody()).some(appliesGuards)) {
				names.add(name);
			}
		}

		for (const declaration of sourceFile.getVariableDeclarations()) {
			const arrow = declaration
				.getInitializer()
				?.asKind(SyntaxKind.ArrowFunction);
			if (arrow && returnedExpressions(arrow.getBody()).some(appliesGuards)) {
				names.add(declaration.getName());
			}
		}
	}

	return names;
}
