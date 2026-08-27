import type { TraceNode } from "../model/timings";

/** Formats a bootstrap timing: one decimal below 10ms, whole above it. */
export function formatMs(ms: number): string {
	const r = Math.round(ms * 10) / 10;
	if (r < 1) {
		return "<1ms";
	}
	if (r < 10) {
		return `${r.toFixed(1)}ms`;
	}
	return `${Math.round(ms)}ms`;
}

export type TraceRowMode = "reused" | "listed" | null;

export interface TraceRowInfo {
	cycle: boolean;
	expandable: boolean;
	listed: boolean;
	node: TraceNode;
	reused: boolean;
}

function traceNode(
	trace: Record<string, TraceNode>,
	id: string
): TraceNode | null {
	return Object.hasOwn(trace, id) ? trace[id] : null;
}

/**
 * Classifies one boot-trace row: whether it cycles, can expand, and whether
 * its cost belongs to an earlier consumer (dep slower than its parent means
 * the dep already existed when the parent loaded).
 */
export function classifyTraceRow(
	id: string,
	depth: number,
	path: string,
	trace: Record<string, TraceNode>,
	mode: TraceRowMode = null
): TraceRowInfo | null {
	const node = traceNode(trace, id);
	if (!node) {
		return null;
	}
	const ancestors = path.split("/");
	ancestors.pop();
	const cycle = ancestors.includes(id);
	const expandable = !cycle && depth < 20 && node.deps.length > 0;
	const parentKey = ancestors.at(-1);
	const parent = parentKey !== undefined ? traceNode(trace, parentKey) : null;
	const reused =
		mode === "reused" || (parent !== null && node.initTime > parent.initTime);
	const listed = !reused && mode === "listed";
	return { node, cycle, expandable, reused, listed };
}
