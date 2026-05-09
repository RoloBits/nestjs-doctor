import {
	findCircularDeps,
	type ModuleGraph,
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

function isFullyMitigatedByForwardRef(
	cycle: string[],
	moduleGraph: ModuleGraph
): boolean {
	const nodes =
		cycle.length > 1 && cycle[0] === cycle.at(-1) ? cycle.slice(0, -1) : cycle;
	for (let i = 0; i < nodes.length; i++) {
		const fromName = nodes[i];
		const toName = nodes[(i + 1) % nodes.length];
		const fromModule = moduleGraph.modules.get(fromName);
		const toModule = moduleGraph.modules.get(toName);
		if (!(fromModule && toModule)) {
			return false;
		}
		if (!fromModule.forwardRefImports.has(toName)) {
			return false;
		}
	}
	return true;
}

function buildConcreteHelp(
	cycle: string[],
	context: ProjectRuleContext
): string {
	const { moduleGraph, providers, project, files } = context;
	const edgeDescriptions: string[] = [];
	let weakestEdge: { description: string; count: number } | undefined;

	for (let i = 0; i < cycle.length; i++) {
		const fromName = cycle[i];
		const toName = cycle[(i + 1) % cycle.length];
		const fromModule = moduleGraph.modules.get(fromName);
		const toModule = moduleGraph.modules.get(toName);

		if (!(fromModule && toModule)) {
			continue;
		}

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
			const depList = deps.map((d) => `${d} (from ${toName})`).join(", ");
			parts.push(`${consumer} (in ${fromName}) injects ${depList}`);
		}

		const description = `${fromName} -> ${toName}: ${parts.join("; ")}`;
		edgeDescriptions.push(description);

		if (!weakestEdge || edges.length < weakestEdge.count) {
			weakestEdge = {
				description: `${fromName} -> ${toName}`,
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
		const fromName = weakestEdge.description.split(" -> ")[0];
		const toName = weakestEdge.description.split(" -> ")[1];
		const fromModule = moduleGraph.modules.get(fromName);
		const toModule = moduleGraph.modules.get(toName);

		if (fromModule && toModule) {
			const edges = traceProviderEdges(
				fromModule,
				toModule,
				providers,
				moduleGraph.providerToModule,
				project,
				files
			);
			const uniqueDeps = [...new Set(edges.map((e) => e.dependency))];
			const providerList = uniqueDeps.join(", ");
			help += `\nConsider extracting ${providerList} into a shared module — it would break the ${weakestEdge.description} edge (${weakestEdge.count} ${depsWord}).`;
		}
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
			if (
				ignoreForwardRefCycles &&
				isFullyMitigatedByForwardRef(cycle, context.moduleGraph)
			) {
				continue;
			}

			const cycleStr = cycle.join(" -> ");
			const firstModule = context.moduleGraph.modules.get(cycle[0]);
			const help = buildConcreteHelp(cycle, context);

			context.report({
				filePath: firstModule?.filePath ?? "unknown",
				message: `Circular module dependency detected: ${cycleStr}`,
				help,
				line: firstModule?.classDeclaration.getStartLineNumber() ?? 1,
				column: 1,
			});
		}
	},
};
