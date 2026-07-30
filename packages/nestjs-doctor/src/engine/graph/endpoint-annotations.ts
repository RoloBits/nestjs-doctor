import type { ClassDeclaration, MethodDeclaration, Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	EndpointAuth,
	EndpointGraph,
	EndpointNode,
} from "../../common/endpoint.js";
import type { GuardFacts } from "../rules/types.js";
import { hasGuardDecorator, PUBLIC_DECORATORS } from "./guard-facts.js";
import type { ModuleGraph } from "./module-graph.js";

/** Guard class names written as plain identifiers in `@UseGuards(...)`. */
function directGuardNames(
	node: ClassDeclaration | MethodDeclaration
): string[] {
	const names: string[] = [];
	for (const decorator of node.getDecorators()) {
		if (decorator.getName() !== "UseGuards") {
			continue;
		}
		for (const argument of decorator.getArguments()) {
			if (argument.getKind() === SyntaxKind.Identifier) {
				names.push(argument.getText());
			}
		}
	}
	return names;
}

function hasPublicDecorator(
	node: ClassDeclaration | MethodDeclaration
): boolean {
	return node
		.getDecorators()
		.some((decorator) => PUBLIC_DECORATORS.has(decorator.getName()));
}

function computeAuth(
	endpoint: EndpointNode,
	astProject: Project,
	facts: GuardFacts
): EndpointAuth {
	const globalGuard = facts.globallyRegistered;
	const cls = astProject
		.getSourceFile(endpoint.filePath)
		?.getClass(endpoint.controllerClass);
	const method = cls?.getMethod(endpoint.handlerMethod);
	if (!(cls && method)) {
		return { globalGuard, guardNames: [], state: "unknown" };
	}

	const composed = facts.composedDecorators;
	const guardNames = [...directGuardNames(cls), ...directGuardNames(method)];

	// Precedence mirrors security/require-guards-on-endpoints.
	if (hasGuardDecorator(cls, composed)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	const name = cls.getName();
	if (name && facts.guardedBaseClasses.has(name)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	if (hasPublicDecorator(cls)) {
		return { globalGuard, guardNames, state: "declared-public" };
	}
	if (hasGuardDecorator(method, composed)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	if (hasPublicDecorator(method)) {
		return { globalGuard, guardNames, state: "declared-public" };
	}
	return { globalGuard, guardNames, state: "unguarded" };
}

function resolveModule(
	endpoint: EndpointNode,
	controllerToModule: Map<string, string>,
	moduleGraph: ModuleGraph
): string | null {
	return (
		controllerToModule.get(endpoint.controllerClass) ??
		moduleGraph.providerToModule.get(endpoint.controllerClass)?.name ??
		null
	);
}

export function annotateEndpoints(
	graph: EndpointGraph,
	astProject: Project,
	guardFacts: GuardFacts,
	moduleGraph: ModuleGraph
): void {
	const controllerToModule = new Map<string, string>();
	for (const module of moduleGraph.modules.values()) {
		for (const controller of module.controllers) {
			controllerToModule.set(controller, module.name);
		}
	}
	for (const endpoint of graph.endpoints) {
		endpoint.auth = computeAuth(endpoint, astProject, guardFacts);
		endpoint.module = resolveModule(endpoint, controllerToModule, moduleGraph);
	}
}
