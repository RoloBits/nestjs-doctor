import { isCodeDiagnostic } from "../common/diagnostic.js";
import { type ModuleGraph, mergeModuleGraphs } from "./graph/module-graph.js";
import { type EngineResult, withScopedDiagnostics } from "./result-builder.js";
import { calculateScore } from "./scorer/index.js";

const ORPHAN_RULE = "performance/no-orphan-modules";

/** The rule stamps ModuleNode.line with the same 1 fallback. */
function locationKey(filePath: string, line: number | undefined): string {
	return `${filePath}|${line ?? 1}`;
}

/**
 * Drops `no-orphan-modules` findings for modules the merged workspace graph
 * shows imported or bootstrapped, then recomputes affected projects' scores.
 * Returns the merged graph so callers can reuse it.
 */
export function pruneCrossProjectOrphans(
	scanResults: Map<string, EngineResult>,
	bootstrapRoots: readonly string[]
): ModuleGraph {
	const graphs = new Map<string, ModuleGraph>();
	for (const [name, result] of scanResults) {
		graphs.set(name, result.moduleGraph);
	}
	const merged = mergeModuleGraphs(graphs);
	const reachable = new Set<string>();
	for (const targets of merged.edges.values()) {
		for (const to of targets) {
			const node = merged.modules.get(to);
			if (node) {
				reachable.add(locationKey(node.filePath, node.line));
			}
		}
	}
	for (const rootName of bootstrapRoots) {
		const node = merged.modules.get(rootName);
		if (node) {
			reachable.add(locationKey(node.filePath, node.line));
		}
	}
	for (const [name, engine] of scanResults) {
		const kept = engine.result.diagnostics.filter(
			(d) =>
				d.rule !== ORPHAN_RULE ||
				!isCodeDiagnostic(d) ||
				!reachable.has(locationKey(d.filePath, d.line))
		);
		if (kept.length === engine.result.diagnostics.length) {
			continue;
		}
		const rescoped = withScopedDiagnostics(
			engine.result,
			kept,
			engine.result.scope
		);
		rescoped.score = calculateScore(kept, engine.result.project.fileCount);
		scanResults.set(name, { ...engine, result: rescoped });
	}
	return merged;
}
