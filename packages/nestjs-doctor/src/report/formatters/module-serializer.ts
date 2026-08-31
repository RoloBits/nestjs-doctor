import {
	bareModuleName,
	type SerializedModuleGraph,
	type SerializedModuleNode,
} from "../../common/artifact.js";
import type { DiagnoseResult } from "../../common/result.js";
import {
	findCircularDeps,
	type ModuleGraph,
} from "../../engine/graph/module-graph.js";
import type {
	BootstrapTimings,
	ClassTiming,
	HookTiming,
	LoadedBootTrace,
} from "../timings.js";
import { attributeTraces } from "./trace-attribution.js";

export function serializeModuleGraph(
	graph: ModuleGraph,
	result: DiagnoseResult,
	projects?: string[],
	bootstrapRoots?: string[],
	traces?: LoadedBootTrace[]
): SerializedModuleGraph {
	// A timing entry only knows the bare name; a project-scoped trace needs
	// it unique inside the project, a shared one unique across the graph.
	const bareNameCounts = new Map<string, number>();
	const globalNameCounts = new Map<string, number>();
	for (const node of graph.modules.values()) {
		const bare = bareModuleName(node);
		const key = `${node.project ?? ""}\u0000${bare}`;
		bareNameCounts.set(key, (bareNameCounts.get(key) ?? 0) + 1);
		globalNameCounts.set(bare, (globalNameCounts.get(bare) ?? 0) + 1);
	}

	const { projects: attributed, rootedProjects } = attributeTraces(
		traces ?? [],
		graph.modules.values(),
		projects,
		bootstrapRoots
	);
	const traceByProject = new Map<string, BootstrapTimings>();
	(traces ?? []).forEach((t, i) => {
		const p = attributed[i];
		if (p && !traceByProject.has(p)) {
			traceByProject.set(p, t.timings);
		}
	});
	const primaryIdx = Math.max(
		attributed.findIndex((p) => p !== undefined),
		0
	);
	const primary = traces?.[primaryIdx]?.timings;
	// Once any dump is attributed, a project with its own entry point but
	// no dump attaches nothing; otherwise every node uses the primary trace.
	const timingsFor = (node: {
		project?: string;
	}): { scoped: boolean; timings: BootstrapTimings } | undefined => {
		if (node.project) {
			const own = traceByProject.get(node.project);
			if (own) {
				return { scoped: true, timings: own };
			}
			if (traceByProject.size > 0 && rootedProjects.has(node.project)) {
				return undefined;
			}
		}
		return primary ? { scoped: false, timings: primary } : undefined;
	};

	const modules: SerializedModuleNode[] = [];
	for (const node of graph.modules.values()) {
		let initTimings: ClassTiming[] | undefined;
		let hookTimings: HookTiming[] | undefined;
		const source = timingsFor(node);
		if (source) {
			const bare = bareModuleName(node);
			const unique = source.scoped
				? bareNameCounts.get(`${node.project ?? ""}\u0000${bare}`) === 1
				: globalNameCounts.get(bare) === 1;
			if (unique) {
				initTimings = source.timings.byModule.get(bare);
				hookTimings = source.timings.hooksByClass.get(bare);
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
		phases: primary?.phases,
		startupMs: primary?.startupMs,
		timingsAvailable: traces?.length ? true : undefined,
		timingsTrace: primary?.trace,
		traces: traces?.length
			? traces.map((t, i) => ({
					label: t.label ?? attributed[i] ?? t.name,
					phases: t.timings.phases,
					project: attributed[i],
					startupMs: t.timings.startupMs,
					trace: t.timings.trace,
				}))
			: undefined,
	};
}
