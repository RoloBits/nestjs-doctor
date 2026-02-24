import {
	findCircularDeps,
	type ModuleGraph,
} from "../../../engine/module-graph.js";
import type { DiagnoseResult } from "../../../types/result.js";

export interface SerializedModuleNode {
	controllers: string[];
	exports: string[];
	filePath: string;
	imports: string[];
	name: string;
	project?: string;
	providers: string[];
}

export interface SerializedModuleGraph {
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
		const slashIdx = node.name.indexOf("/");
		const project =
			projects && projects.length > 0 && slashIdx !== -1
				? node.name.slice(0, slashIdx)
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

	const edges: Array<{ from: string; to: string }> = [];
	for (const [from, targets] of graph.edges) {
		for (const to of targets) {
			edges.push({ from, to });
		}
	}

	const circularDeps = findCircularDeps(graph);

	const circularDepRecommendations: Record<string, string> = {};
	for (const diag of result.diagnostics) {
		if (diag.rule !== "architecture/no-circular-module-deps") {
			continue;
		}
		for (const cycle of circularDeps) {
			const cycleStr = cycle.join(" -> ");
			if (diag.message.includes(cycleStr)) {
				circularDepRecommendations[cycle.join(",")] = diag.help;
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
