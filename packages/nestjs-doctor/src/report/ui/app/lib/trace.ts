import { badge } from "./badge.js";
import { escapeHtml } from "./escape.js";

interface TraceHook {
	count?: number;
	hook: string;
	ms: number;
}

export interface TraceNode {
	deps: string[];
	hooks?: TraceHook[];
	initTime: number;
	name: string;
	type: string;
}

export type TraceMap = Record<string, TraceNode>;

const TRACE_COLORS: Record<string, string> = {
	provider: "34,211,238",
	controller: "167,139,250",
	injectable: "52,211,153",
	middleware: "244,114,182",
};

const HOOK_META: Record<string, { label: string; rgb: string }> = {
	onModuleInit: { label: "init", rgb: "52,211,153" },
	onApplicationBootstrap: { label: "bootstrap", rgb: "167,139,250" },
};

interface PhasePart {
	label: string;
	ms: number;
	rgb: string;
	tip: string;
}

interface PhasedGraph {
	phases?: {
		createMs?: number;
		initMs?: number;
		moduleInitMs?: number;
	} | null;
	startupMs?: number;
}

// Splits the captured boot into labelled segments. Without createMs the
// earlier boundaries are unknown, so segments would mislabel.
export function phaseParts(graph: PhasedGraph): PhasePart[] {
	const p = graph.phases;
	if (!p || typeof p.createMs !== "number") {
		return [];
	}
	const parts: PhasePart[] = [];
	let prev = 0;
	const push = (
		label: string,
		end: number | undefined,
		rgb: string,
		tip: string
	) => {
		if (typeof end !== "number" || end <= prev) {
			return;
		}
		parts.push({ label, ms: end - prev, rgb, tip });
		prev = end;
	};
	push(
		"create",
		p.createMs,
		"34,211,238",
		"create — constructing providers and controllers"
	);
	if (typeof p.moduleInitMs === "number") {
		push(
			"onModuleInit",
			p.moduleInitMs,
			"52,211,153",
			"onModuleInit — hooks across all classes"
		);
		push(
			"onApplicationBootstrap",
			p.initMs,
			"167,139,250",
			"onApplicationBootstrap — hooks across all classes"
		);
	} else {
		push(
			"lifecycle hooks",
			p.initMs,
			"52,211,153",
			"lifecycle hooks — onModuleInit and onApplicationBootstrap"
		);
	}
	if (typeof graph.startupMs === "number") {
		let tail = {
			label: "hooks + listen",
			tip: "hooks + listen — everything after NestFactory.create",
		};
		if (typeof p.initMs === "number") {
			tail = { label: "listen", tip: "listen — binding the HTTP server" };
		} else if (typeof p.moduleInitMs === "number") {
			tail = {
				label: "bootstrap + listen",
				tip: "bootstrap + listen — onApplicationBootstrap hooks and the server bind",
			};
		}
		push(tail.label, graph.startupMs, "107,114,128", tail.tip);
	}
	return parts;
}

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

export function traceNode(trace: TraceMap, id: string): TraceNode | null {
	return Object.hasOwn(trace, id) ? trace[id] : null;
}

function traceColor(type: string): string {
	return Object.hasOwn(TRACE_COLORS, type) ? TRACE_COLORS[type] : "107,114,128";
}

export function hookChipHtml(hooks: TraceHook[] | undefined): string {
	if (!hooks || hooks.length === 0) {
		return "";
	}
	let html = "";
	for (const h of hooks) {
		const meta = Object.hasOwn(HOOK_META, h.hook)
			? HOOK_META[h.hook]
			: { label: h.hook, rgb: "107,114,128" };
		const times = h.count && h.count > 1 ? ` across ${h.count} instances` : "";
		html +=
			`<span class="mg-trace-hook" style="color:rgb(${meta.rgb});background:rgba(${meta.rgb},0.12)"` +
			` data-tip="${escapeHtml(`${h.hook} took ${formatMs(h.ms)}${times}`)}">+` +
			`${escapeHtml(formatMs(h.ms))} ${escapeHtml(meta.label)}` +
			`${h.count && h.count > 1 ? ` ×${h.count}` : ""}</span>`;
	}
	return html;
}

function traceBadgeHtml(type: string): string {
	const rgb = traceColor(type);
	return badge({
		style: `color:rgb(${rgb});background:rgba(${rgb},0.12)`,
		text: escapeHtml(type),
	});
}

function traceBarHtml(
	trace: TraceMap,
	traceMax: number,
	initTime: number,
	deps: string[],
	type: string,
	hollowTip: string | null
): string {
	const frac = Math.max(0, Math.min(1, initTime / traceMax));
	const width = (frac * 100).toFixed(2);
	if (hollowTip) {
		return (
			`<span class="mg-trace-track" data-tip="${escapeHtml(`${formatMs(initTime)} total — ${hollowTip}`)}">` +
			`<span class="mg-trace-bar" style="width:${width}%;background:transparent;box-shadow:inset 0 0 0 1px rgba(${traceColor(type)},0.5)"></span>` +
			"</span>"
		);
	}
	// Slowest dep this class could actually have waited on: a dep slower than
	// the class itself was pre-built, so it never entered this class's clock.
	let slowestDep = 0;
	for (const d of deps) {
		const dep = traceNode(trace, d);
		if (dep && dep.initTime <= initTime) {
			slowestDep = dep.initTime;
			break;
		}
	}
	const selfFrac = Math.max(
		0,
		Math.min(frac, (initTime - slowestDep) / traceMax)
	);
	const tip =
		`${formatMs(initTime)} total` +
		(slowestDep > 0
			? ` — ≈${formatMs(slowestDep)} waiting on dependencies, ≈${formatMs(Math.max(0, initTime - slowestDep))} own work`
			: " — all own work");
	return (
		`<span class="mg-trace-track" data-tip="${escapeHtml(tip)}">` +
		`<span class="mg-trace-bar" style="width:${width}%;background:rgba(${traceColor(type)},0.4)"></span>` +
		(selfFrac > 0.002
			? `<span class="mg-trace-self" style="left:${((frac - selfFrac) * 100).toFixed(2)}%;width:${(selfFrac * 100).toFixed(2)}%"></span>`
			: "") +
		"</span>"
	);
}

export function traceRowHtml(
	trace: TraceMap,
	traceMax: number,
	id: string,
	depth: number,
	path: string,
	mode?: string | null
): string {
	const node = traceNode(trace, id);
	if (!node) {
		return "";
	}
	const ancestors = path.split("/");
	ancestors.pop();
	const cyc = ancestors.indexOf(id) >= 0;
	const expandable = !cyc && depth < 20 && node.deps.length > 0;
	// Slower than its consumer means the dep already existed when the consumer loaded.
	const parent =
		ancestors.length > 0 ? traceNode(trace, ancestors.at(-1) as string) : null;
	const reused =
		mode === "reused" || (parent !== null && node.initTime > parent.initTime);
	const listed = !reused && mode === "listed";
	let mark: { bar: string; cls: string; tag: string; tip: string } | null =
		null;
	if (reused) {
		mark = {
			cls: " mg-trace-reused",
			tag: "reused",
			tip: "Already built when this parent loaded — its cost is counted at its first consumer",
			bar: "already built for an earlier consumer; not paid here",
		};
	} else if (listed) {
		mark = {
			cls: " mg-trace-reused",
			tag: "listed above",
			tip: "Has its own row at the top of this trace — the cost is detailed there",
			bar: "detailed in its own row at the top of this trace",
		};
	}
	return (
		`<div class="mg-trace-row${expandable ? " mg-trace-expandable" : ""}${mark ? mark.cls : ""}"` +
		` data-trace="${escapeHtml(id)}" data-path="${escapeHtml(path)}" data-depth="${depth}"` +
		`${mark ? ` data-mark="${reused ? "reused" : "listed"}"` : ""}>` +
		`<span class="mg-trace-label" style="padding-left:${Math.min(depth, 8) * 16}px">` +
		`<span class="mg-trace-caret">${expandable ? "▸" : ""}</span>` +
		`<span class="mg-trace-name" data-tip="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>` +
		traceBadgeHtml(node.type) +
		hookChipHtml(node.hooks) +
		(mark
			? `<span class="mg-trace-reused-tag" data-tip="${mark.tip}">${mark.tag}</span>`
			: "") +
		(cyc
			? '<span class="mg-trace-cycle" data-tip="circular dependency">↻</span>'
			: "") +
		"</span>" +
		traceBarHtml(
			trace,
			traceMax,
			node.initTime,
			node.deps,
			node.type,
			mark ? mark.bar : null
		) +
		`<span class="mg-trace-time">${escapeHtml(formatMs(node.initTime))}</span>` +
		"</div>"
	);
}
