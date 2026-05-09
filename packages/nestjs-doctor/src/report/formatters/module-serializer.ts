import type { DiagnoseResult } from "../../common/result.js";
import {
	findCircularDeps,
	type ModuleGraph,
} from "../../engine/graph/module-graph.js";

interface SerializedModuleNode {
	controllers: string[];
	exports: string[];
	filePath: string;
	imports: string[];
	name: string;
	project?: string;
	providers: string[];
}

interface SerializedModuleGraph {
	circularDepRecommendations: Record<string, string>;
	circularDeps: string[][];
	edges: Array<{ from: string; to: string }>;
	modules: SerializedModuleNode[];
	projects: string[];
}

export function serializeModuleGraph(
	graph: ModuleGraph,
	result: DiagnoseResult,
	projects?: string[]
): SerializedModuleGraph {
	const modules: SerializedModuleNode[] = [];
	for (const node of graph.modules.values()) {
		// Project name is encoded as the prefix before the first slash on the
		// composite key (mergeModuleGraphs prepends `${projectName}/`).
		const slashIdx = node.key.indexOf("/");
		const project =
			projects && projects.length > 0 && slashIdx !== -1
				? node.key.slice(0, slashIdx)
				: undefined;
		modules.push({
			name: node.name,
			filePath: node.filePath,
			imports: node.imports,
			exports: node.exports,
			providers: node.providers,
			controllers: node.controllers,
			project,
		});
	}

	// Edges in the graph are keyed by composite ModuleNode keys; downstream UI
	// consumers expect human-readable names, so resolve each edge to its node's name.
	const edges: Array<{ from: string; to: string }> = [];
	for (const [fromKey, targets] of graph.edges) {
		const fromName = graph.modules.get(fromKey)?.name ?? fromKey;
		for (const toKey of targets) {
			const toName = graph.modules.get(toKey)?.name ?? toKey;
			edges.push({ from: fromName, to: toName });
		}
	}

	// Cycles from findCircularDeps contain composite keys; project them onto
	// display names so the report message and the UI agree.
	const rawCycles = findCircularDeps(graph);
	const circularDeps = rawCycles.map((cycle) =>
		cycle.map((key) => graph.modules.get(key)?.name ?? key)
	);

	// Recommendations are keyed by the composite cycle (not the display projection)
	// so two distinct cycles whose display names happen to match — common after the
	// name-collision fix introduces multiple modules with the same class name —
	// don't overwrite each other.
	const circularDepRecommendations: Record<string, string> = {};
	for (const diag of result.diagnostics) {
		if (diag.rule !== "architecture/no-circular-module-deps") {
			continue;
		}
		for (let i = 0; i < rawCycles.length; i++) {
			const displayCycle = circularDeps[i];
			const cycleStr = displayCycle.join(" -> ");
			if (diag.message.includes(cycleStr)) {
				circularDepRecommendations[rawCycles[i].join(",")] = diag.help;
			}
		}
	}

	return {
		modules,
		edges,
		circularDeps,
		circularDepRecommendations,
		projects: projects ?? [],
	};
}
