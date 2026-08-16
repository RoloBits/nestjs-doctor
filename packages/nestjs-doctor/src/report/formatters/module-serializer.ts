import type { DiagnoseResult } from "../../common/result.js";
import {
	findCircularDeps,
	type ModuleGraph,
} from "../../engine/graph/module-graph.js";

interface SerializedModuleNode {
	controllers: string[];
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	imports: string[];
	isGlobal?: boolean;
	line?: number;
	name: string;
	project?: string;
	providers: string[];
	providerTokens?: string[];
}

interface SerializedModuleGraph {
	bootstrapRoots?: string[];
	circularDepRecommendations: Record<string, string>;
	circularDeps: string[][];
	edges: Array<{ from: string; to: string }>;
	modules: SerializedModuleNode[];
	projects: string[];
}

export function serializeModuleGraph(
	graph: ModuleGraph,
	result: DiagnoseResult,
	projects?: string[],
	bootstrapRoots?: string[]
): SerializedModuleGraph {
	const modules: SerializedModuleNode[] = [];
	for (const node of graph.modules.values()) {
		modules.push({
			name: node.name,
			filePath: node.filePath,
			// The same module can be listed twice, e.g. plainly and via forRoot().
			imports: [...new Set(node.imports)],
			exports: node.exports,
			providers: node.providers,
			providerTokens: node.providerTokens,
			controllers: node.controllers,
			project: node.project,
			isGlobal: node.isGlobal,
			line: node.line,
			dynamicImports: node.dynamicImports,
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
		bootstrapRoots,
	};
}
