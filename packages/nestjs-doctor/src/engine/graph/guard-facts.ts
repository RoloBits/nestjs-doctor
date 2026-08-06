import type { ClassDeclaration, MethodDeclaration, Project } from "ts-morph";
import type { GuardFacts } from "../rules/types.js";
import {
	type GuardDecoratorIndex,
	guardDecoratorNames,
} from "./guard-decorators.js";
import type { ModuleGraph } from "./module-graph.js";

/** Decorator names that mark a route as intentionally public. */
export const PUBLIC_DECORATORS: ReadonlySet<string> = new Set([
	"Public",
	"AllowAnonymous",
	"SkipAuth",
	"IsPublic",
]);

/** True for `@UseGuards()` or a decorator known to compose it. */
export function hasGuardDecorator(
	node: ClassDeclaration | MethodDeclaration,
	composedDecorators: ReadonlySet<string>
): boolean {
	return node
		.getDecorators()
		.some(
			(decorator) =>
				decorator.getName() === "UseGuards" ||
				composedDecorators.has(decorator.getName())
		);
}

export function buildGuardFacts(
	astProject: Project,
	files: string[],
	moduleGraph: ModuleGraph,
	guardDecorators: GuardDecoratorIndex
): GuardFacts {
	const composedDecorators = guardDecoratorNames(guardDecorators);

	const guardedBaseClasses = new Set<string>();
	for (const filePath of files) {
		const sourceFile = astProject.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		for (const cls of sourceFile.getClasses()) {
			const base = cls.getExtends()?.getExpression().getText();
			if (!base) {
				continue;
			}
			if (hasGuardDecorator(cls, composedDecorators)) {
				guardedBaseClasses.add(base.split("<")[0].split(".").pop() ?? base);
			}
		}
	}

	return {
		composedDecorators,
		globallyRegistered: [...moduleGraph.modules.values()].some((module) =>
			module.providerTokens.includes("APP_GUARD")
		),
		guardedBaseClasses,
	};
}
