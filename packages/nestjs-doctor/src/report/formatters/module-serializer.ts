import type { DiagnoseResult } from "../../common/result.js";
import {
	findCircularDeps,
	type ModuleGraph,
} from "../../engine/graph/module-graph.js";
import type {
	BootPhases,
	BootstrapTimings,
	ClassTiming,
	HookTiming,
	TraceNode,
} from "../timings.js";

interface SerializedModuleNode {
	controllers: string[];
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	hookTimings?: HookTiming[];
	imports: string[];
	initTimings?: ClassTiming[];
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
	phases?: BootPhases;
	projects: string[];
	startupMs?: number;
	timingsAvailable?: boolean;
	timingsTrace?: Record<string, TraceNode>;
}

/** Strips the monorepo project prefix, matching getDisplayName in the report UI. */
function bareModuleName(node: { name: string; project?: string }): string {
	return node.project && node.name.startsWith(`${node.project}/`)
		? node.name.slice(node.project.length + 1)
		: node.name;
}

export function serializeModuleGraph(
	graph: ModuleGraph,
	result: DiagnoseResult,
	projects?: string[],
	bootstrapRoots?: string[],
	timings?: BootstrapTimings
): SerializedModuleGraph {
	// A timing entry only knows the bare class name; attach it only when unique.
	const bareNameCounts = new Map<string, number>();
	if (timings) {
		for (const node of graph.modules.values()) {
			const bare = bareModuleName(node);
			bareNameCounts.set(bare, (bareNameCounts.get(bare) ?? 0) + 1);
		}
	}

	const modules: SerializedModuleNode[] = [];
	for (const node of graph.modules.values()) {
		let initTimings: ClassTiming[] | undefined;
		let hookTimings: HookTiming[] | undefined;
		if (timings) {
			const bare = bareModuleName(node);
			if (bareNameCounts.get(bare) === 1) {
				initTimings = timings.byModule.get(bare);
				hookTimings = timings.hooksByClass.get(bare);
			}
		}
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
			initTimings,
			hookTimings,
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
		phases: timings?.phases,
		startupMs: timings?.startupMs,
		timingsAvailable: timings ? true : undefined,
		timingsTrace: timings?.trace,
	};
}
