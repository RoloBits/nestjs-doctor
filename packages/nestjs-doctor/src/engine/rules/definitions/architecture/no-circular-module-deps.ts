import {
	findCircularDeps,
	type ModuleNode,
	type ProviderEdge,
	traceProviderEdges,
} from "../../../graph/module-graph.js";
import type { ProjectRule, ProjectRuleContext } from "../../types.js";

const GENERIC_HELP =
	"Break the cycle by extracting the coupling providers into a shared module. forwardRef() only defers resolution at runtime — it does not address the architectural coupling. Use forwardRef() as a last resort and enable rules.architecture/no-circular-module-deps.options.ignoreForwardRefCycles to opt out of these reports.";

function readIgnoreForwardRefOption(context: ProjectRuleContext): boolean {
	const override =
		context.config.rules?.["architecture/no-circular-module-deps"];
	if (typeof override !== "object" || override === null) {
		return false;
	}
	return override.options?.ignoreForwardRefCycles === true;
}

function isFullyMitigatedByForwardRef(cycleNodes: ModuleNode[]): boolean {
	// Defensive: drop the trailing duplicate if findCircularDeps returns a
	// closed-cycle shape (e.g. [A, B, A] from the rare `[...path, neighbor]`
	// fallback). Using class names against forwardRefImports because that Set
	// stores the original `imports: [forwardRef(() => X)]` symbol names.
	const nodes =
		cycleNodes.length > 1 && cycleNodes[0] === cycleNodes.at(-1)
			? cycleNodes.slice(0, -1)
			: cycleNodes;
	for (let i = 0; i < nodes.length; i++) {
		const fromModule = nodes[i];
		const toModule = nodes[(i + 1) % nodes.length];
		if (!fromModule.forwardRefImports.has(toModule.name)) {
			return false;
		}
	}
	return true;
}

function buildConcreteHelp(
	cycleNodes: ModuleNode[],
	context: ProjectRuleContext
): string {
	const { moduleGraph, providers, project, files } = context;
	const edgeDescriptions: string[] = [];
	let weakestEdge:
		| { fromNode: ModuleNode; toNode: ModuleNode; count: number }
		| undefined;

	for (let i = 0; i < cycleNodes.length; i++) {
		const fromModule = cycleNodes[i];
		const toModule = cycleNodes[(i + 1) % cycleNodes.length];

		const edges: ProviderEdge[] = traceProviderEdges(
			fromModule,
			toModule,
			providers,
			moduleGraph.providerToModule,
			project,
			files
		);

		if (edges.length === 0) {
			continue;
		}

		const grouped = new Map<string, string[]>();
		for (const edge of edges) {
			const existing = grouped.get(edge.consumer);
			if (existing) {
				existing.push(edge.dependency);
			} else {
				grouped.set(edge.consumer, [edge.dependency]);
			}
		}

		const parts: string[] = [];
		for (const [consumer, deps] of grouped) {
			const depList = deps
				.map((d) => `${d} (from ${toModule.name})`)
				.join(", ");
			parts.push(`${consumer} (in ${fromModule.name}) injects ${depList}`);
		}

		const description = `${fromModule.name} -> ${toModule.name}: ${parts.join("; ")}`;
		edgeDescriptions.push(description);

		if (!weakestEdge || edges.length < weakestEdge.count) {
			weakestEdge = {
				fromNode: fromModule,
				toNode: toModule,
				count: edges.length,
			};
		}
	}

	if (edgeDescriptions.length === 0) {
		return GENERIC_HELP;
	}

	let help = edgeDescriptions.join("\n");

	if (weakestEdge) {
		const depsWord = weakestEdge.count === 1 ? "dependency" : "dependencies";

		// Find providers to extract — the dependencies on the weakest edge
		const edges = traceProviderEdges(
			weakestEdge.fromNode,
			weakestEdge.toNode,
			providers,
			moduleGraph.providerToModule,
			project,
			files
		);
		const uniqueDeps = [...new Set(edges.map((e) => e.dependency))];
		const providerList = uniqueDeps.join(", ");
		help += `\nConsider extracting ${providerList} into a shared module — it would break the ${weakestEdge.fromNode.name} -> ${weakestEdge.toNode.name} edge (${weakestEdge.count} ${depsWord}).`;
	}

	return help;
}

export const noCircularModuleDeps: ProjectRule = {
	meta: {
		id: "architecture/no-circular-module-deps",
		category: "architecture",
		severity: "error",
		description: "Module import graph must not contain circular dependencies",
		help: GENERIC_HELP,
		scope: "project",
	},

	check(context) {
		const cycles = findCircularDeps(context.moduleGraph);
		const ignoreForwardRefCycles = readIgnoreForwardRefOption(context);

		for (const cycle of cycles) {
			const cycleNodes: ModuleNode[] = [];
			for (const key of cycle) {
				const node = context.moduleGraph.modules.get(key);
				if (node) {
					cycleNodes.push(node);
				}
			}
			if (cycleNodes.length === 0) {
				continue;
			}

			if (ignoreForwardRefCycles && isFullyMitigatedByForwardRef(cycleNodes)) {
				continue;
			}

			const cycleStr = cycleNodes.map((n) => n.name).join(" -> ");
			const firstModule = cycleNodes[0];
			const help = buildConcreteHelp(cycleNodes, context);

			context.report({
				filePath: firstModule.filePath,
				message: `Circular module dependency detected: ${cycleStr}`,
				help,
				line: firstModule.classDeclaration.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
