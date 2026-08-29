import type { SerializedModuleGraph } from "../../../../common/artifact.js";
import type { HookTiming } from "../../../../common/timings.js";
import { ICONS } from "../atoms/icons.js";
import { escapeHtml } from "./escape.js";
import {
	axisStep,
	fillOf,
	formatMs,
	hookMeta,
	PALETTE,
	phaseParts,
} from "./trace.js";

/** Group for trace classes whose module name repeated across projects. */
export const UNATTRIBUTED_MODULE = "unattributed";

const SPAN_COLORS: Record<string, string> = {
	controller: PALETTE.violet,
	injectable: PALETTE.green,
	middleware: PALETTE.amber,
	provider: PALETTE.blue,
};

const DEFAULT_COLOR = PALETTE.grey;

export function spanColor(type: string): string {
	return Object.hasOwn(SPAN_COLORS, type) ? SPAN_COLORS[type] : DEFAULT_COLOR;
}

export interface BootSpan {
	deps: string[];
	/** Offset from boot start when construction finished (the dump's initTime). */
	end: number;
	hooks?: HookTiming[];
	id: string;
	module: string;
	name: string;
	start: number;
	type: string;
	/** Id of the dependency whose finish set this class's start, if any. */
	waitedOn?: string;
}

interface BootGroup {
	end: number;
	module: string;
	spans: BootSpan[];
	start: number;
}

interface BootPhase {
	end: number;
	gloss: string;
	label: string;
	rgb: string;
	start: number;
	tip: string;
}

export interface BootTimeline {
	byId: Map<string, BootSpan>;
	consumersOf: Map<string, string[]>;
	groups: BootGroup[];
	maxMs: number;
	phases: BootPhase[];
}

export interface BootWindow {
	from: number;
	to: number;
}

export function buildBootTimeline(
	graph: SerializedModuleGraph
): BootTimeline | null {
	const trace = graph.timingsTrace ?? {};
	if (Object.keys(trace).length === 0) {
		return null;
	}
	const moduleOfId = new Map<string, string>();
	for (const m of graph.modules) {
		for (const t of m.initTimings ?? []) {
			moduleOfId.set(t.id, m.name);
		}
	}
	const byId = new Map<string, BootSpan>();
	for (const [id, node] of Object.entries(trace)) {
		// Deps are sorted slowest first; the slowest one that finished before this
		// class sets its start, otherwise the class starts at boot.
		let start = 0;
		let waitedOn: string | undefined;
		for (const d of node.deps) {
			if (!Object.hasOwn(trace, d)) {
				continue;
			}
			const dep = trace[d];
			if (dep.initTime <= node.initTime) {
				start = dep.initTime;
				waitedOn = d;
				break;
			}
		}
		byId.set(id, {
			deps: node.deps,
			end: node.initTime,
			hooks: node.hooks,
			id,
			module: moduleOfId.get(id) ?? UNATTRIBUTED_MODULE,
			name: node.name,
			start,
			type: node.type,
			...(waitedOn ? { waitedOn } : {}),
		});
	}

	const groupMap = new Map<string, BootSpan[]>();
	for (const s of byId.values()) {
		const list = groupMap.get(s.module) ?? [];
		list.push(s);
		groupMap.set(s.module, list);
	}
	const groups: BootGroup[] = [];
	// Groups run in the order their first class finished.
	const firstEnd = new Map<string, number>();
	for (const [module, spans] of groupMap) {
		spans.sort((a, b) => a.end - b.end || a.name.localeCompare(b.name));
		let start = Number.POSITIVE_INFINITY;
		let end = 0;
		for (const s of spans) {
			start = Math.min(start, s.start);
			let spanEnd = s.end;
			for (const h of s.hooks ?? []) {
				if (typeof h.startMs === "number") {
					spanEnd = Math.max(spanEnd, h.startMs + h.ms);
				}
			}
			end = Math.max(end, spanEnd);
		}
		firstEnd.set(module, (spans[0] as BootSpan).end);
		groups.push({ end, module, spans, start });
	}
	groups.sort(
		(a, b) =>
			(firstEnd.get(a.module) ?? 0) - (firstEnd.get(b.module) ?? 0) ||
			a.module.localeCompare(b.module)
	);

	const consumersOf = new Map<string, string[]>();
	for (const s of byId.values()) {
		for (const d of s.deps) {
			const list = consumersOf.get(d) ?? [];
			list.push(s.id);
			consumersOf.set(d, list);
		}
	}

	const phases: BootPhase[] = [];
	let prev = 0;
	for (const p of phaseParts(graph)) {
		phases.push({
			end: prev + p.ms,
			gloss: p.gloss,
			label: p.label,
			rgb: p.rgb,
			start: prev,
			tip: p.tip,
		});
		prev += p.ms;
	}

	let maxMs = graph.startupMs ?? 0;
	for (const g of groups) {
		maxMs = Math.max(maxMs, g.end);
	}
	for (const p of phases) {
		maxMs = Math.max(maxMs, p.end);
	}
	if (maxMs <= 0) {
		return null;
	}
	return { byId, consumersOf, groups, maxMs, phases };
}

/** Ids of every class whose dependencies can be cascaded open. */
export function expandableIds(t: BootTimeline): Set<string> {
	const ids = new Set<string>();
	for (const s of t.byId.values()) {
		if (s.deps.length > 0) {
			ids.add(s.id);
		}
	}
	return ids;
}

export interface ModuleTiming {
	/** Own construction of the module's slowest class, after its dependencies. */
	buildMs: number;
	/** Hook time across the module's classes, by hook kind, in dump order. */
	hooks: { label: string; ms: number }[];
}

/** What a module cost: its slowest class's own build, plus its classes' hooks. */
export function moduleTimings(
	graph: SerializedModuleGraph
): Map<string, ModuleTiming> {
	const out = new Map<string, ModuleTiming>();
	const t = buildBootTimeline(graph);
	if (!t) {
		return out;
	}
	for (const g of t.groups) {
		let buildMs = 0;
		const hooks = new Map<string, number>();
		for (const s of g.spans) {
			buildMs = Math.max(buildMs, s.end - s.start);
			for (const h of s.hooks ?? []) {
				const label = hookMeta(h.hook).label;
				hooks.set(label, (hooks.get(label) ?? 0) + h.ms);
			}
		}
		out.set(g.module, {
			buildMs,
			hooks: [...hooks].map(([label, ms]) => ({ label, ms })),
		});
	}
	return out;
}

/** `104ms build`, then one line per hook kind: `63ms init`, `40ms bootstrap`. */
export function moduleTimingLines(timing: ModuleTiming): string[] {
	const lines = [`${formatMs(timing.buildMs)} build`];
	for (const h of timing.hooks) {
		lines.push(`${formatMs(h.ms)} ${h.label}`);
	}
	return lines;
}

/** The same numbers on one line: `104ms build · 63ms init`. */
export function moduleTimingLabel(timing: ModuleTiming): string {
	return moduleTimingLines(timing).join(" · ");
}

export function slowestSpanId(t: BootTimeline): string | null {
	let best: string | null = null;
	let bestEnd = -1;
	for (const s of t.byId.values()) {
		if (s.end > bestEnd) {
			bestEnd = s.end;
			best = s.id;
		}
	}
	return best;
}

export function clampWindow(win: BootWindow, maxMs: number): BootWindow {
	let { from, to } = win;
	if (!(to > from)) {
		from = 0;
		to = maxMs;
	}
	const width = Math.min(Math.max(to - from, maxMs / 5000), maxMs);
	from = Math.min(Math.max(from, 0), maxMs - width);
	return { from, to: from + width };
}

/** Scales the window by factor around anchor time, e.g. 0.5 zooms in. */
export function zoomWindow(
	win: BootWindow,
	maxMs: number,
	factor: number,
	anchor: number
): BootWindow {
	const width = Math.min(
		Math.max((win.to - win.from) * factor, maxMs / 5000),
		maxMs
	);
	const frac = (anchor - win.from) / (win.to - win.from);
	const from = anchor - frac * width;
	return clampWindow({ from, to: from + width }, maxMs);
}

/** Window centred on a span with context around it, clamped to the boot. */
export function windowAround(
	span: { end: number; start: number },
	maxMs: number
): BootWindow {
	const width = Math.max(span.end - span.start, maxMs * 0.02) * 4;
	return clampWindow(
		{ from: span.start - width / 2, to: span.end + width / 2 },
		maxMs
	);
}

/** Percent position of t inside win; may sit outside 0-100 for out-of-view spans. */
export function pct(t: number, win: BootWindow): number {
	return ((t - win.from) / (win.to - win.from)) * 100;
}

export function windowTicks(win: BootWindow): number[] {
	const width = win.to - win.from;
	if (width <= 0) {
		return [];
	}
	const step = axisStep(width);
	const ticks: number[] = [];
	// Ticks stay clear of both edge labels.
	for (let i = Math.floor(win.from / step) + 1; i * step < win.to; i++) {
		const tick = i * step;
		if (tick - win.from >= width * 0.05 && win.to - tick >= width * 0.06) {
			ticks.push(tick);
		}
	}
	return ticks;
}

export function spanMatches(span: BootSpan, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) {
		return true;
	}
	return (
		span.name.toLowerCase().includes(q) ||
		span.module.toLowerCase().includes(q) ||
		span.type.toLowerCase().includes(q)
	);
}

interface BootRowOptions {
	expandedCascades?: ReadonlySet<string>;
	expandedModules: ReadonlySet<string>;
	query: string;
	selectedId: string | null;
	/** Module picked elsewhere (the graph), highlighted on its group row. */
	selectedModule?: string | null;
	win: BootWindow;
}

function groupBarStyle(g: BootGroup, win: BootWindow): string {
	const left = pct(g.start, win);
	const right = pct(g.end, win);
	return `left:${left.toFixed(3)}%;width:${Math.max(right - left, 0.1).toFixed(3)}%`;
}

// Every bar carries the time it took, inside it; narrow bars clip the text.
function classBarHtml(span: BootSpan, win: BootWindow): string {
	const left = pct(span.start, win);
	const width = Math.max(pct(span.end, win) - left, 0.12);
	let html =
		`<span class="boot-bar" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:rgb(${fillOf(spanColor(span.type))})">` +
		`${escapeHtml(formatMs(span.end - span.start))}</span>`;
	(span.hooks ?? []).forEach((h, index) => {
		if (typeof h.startMs !== "number") {
			return;
		}
		const meta = hookMeta(h.hook);
		const left = pct(h.startMs, win);
		const width = Math.max(pct(h.startMs + h.ms, win) - left, 0.12);
		html +=
			`<span class="boot-hook-span" data-hook="${index}"` +
			` style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:rgb(${fillOf(meta.rgb)})">` +
			`${escapeHtml(`+${formatMs(h.ms)} ${meta.label}`)}</span>`;
	});
	return html;
}

// One indent per level, then the chevron slot, present on every row.
function indentsHtml(depth: number): string {
	return '<span class="boot-indent"></span>'.repeat(Math.min(depth, 8));
}

function caretHtml(expandable: boolean): string {
	return `<span class="boot-caret">${expandable ? ICONS.chevronSmall : ""}</span>`;
}

function classLabelHtml(
	span: BootSpan,
	depth: number,
	expandable: boolean,
	mark = ""
): string {
	return (
		'<span class="boot-label">' +
		indentsHtml(depth) +
		caretHtml(expandable) +
		`<span class="boot-dot" style="background:rgb(${spanColor(span.type)})"></span>` +
		`<span class="boot-name">${escapeHtml(span.name)}</span>` +
		mark +
		hookChipsHtml(span) +
		"</span>"
	);
}

/** Dotted lines where one lifecycle phase hands over to the next. */
function guidesHtml(t: BootTimeline, win: BootWindow): string {
	let html = "";
	for (const p of t.phases.slice(1)) {
		const left = pct(p.start, win);
		if (left < 0 || left > 100) {
			continue;
		}
		html += `<span class="boot-guide" style="left:${left.toFixed(3)}%;border-color:rgba(${p.rgb},0.6)"></span>`;
	}
	return html ? `<span class="boot-guides">${html}</span>` : "";
}

function hookChipsHtml(span: BootSpan): string {
	const chips = (span.hooks ?? []).filter((h) => typeof h.startMs !== "number");
	if (chips.length === 0) {
		return "";
	}
	let html = "";
	for (const h of chips) {
		const meta = hookMeta(h.hook);
		const times = h.count && h.count > 1 ? ` ×${h.count}` : "";
		html +=
			`<span class="boot-hook-chip" style="color:rgb(${meta.rgb});background:rgba(${meta.rgb},0.12)">+` +
			`${escapeHtml(formatMs(h.ms))} ${escapeHtml(meta.label)}${escapeHtml(times)}</span>`;
	}
	return html;
}

// Every class has its own row in its module group, so a cascade row is a
// striped shadow of it, deduped: the cost is drawn once, at the row above.
export function cascadeChildrenHtml(
	t: BootTimeline,
	parentId: string,
	depth: number,
	o: BootRowOptions,
	ancestors: ReadonlySet<string> = new Set([parentId])
): string {
	const parent = t.byId.get(parentId);
	if (!parent || depth > 20) {
		return "";
	}
	let html = "";
	for (const depId of parent.deps) {
		const dep = t.byId.get(depId);
		if (!dep) {
			continue;
		}
		// A dep slower than its consumer was pre-built for an earlier consumer.
		const cyclic = ancestors.has(depId);
		const reused = !cyclic && dep.end > parent.end;
		let tag = "deduped";
		if (cyclic) {
			tag = "circular";
		} else if (reused) {
			tag = "shared";
		}
		const expandable = !(cyclic || reused) && dep.deps.length > 0;
		const expanded = expandable && o.expandedCascades?.has(depId) === true;
		html +=
			`<div class="boot-row boot-class-row boot-cascade-row boot-reused${expandable ? " boot-expandable" : ""}${expanded ? " boot-expanded" : ""}"` +
			` data-id="${escapeHtml(dep.id)}" data-depth="${depth}" data-mark="${tag}">` +
			classLabelHtml(
				dep,
				depth + 1,
				expandable,
				`<span class="boot-reused-tag">${tag}</span>`
			) +
			'<span class="boot-track">' +
			classBarHtml(dep, o.win) +
			"</span></div>";
		if (expanded) {
			html += cascadeChildrenHtml(
				t,
				depId,
				depth + 1,
				o,
				new Set(ancestors).add(depId)
			);
		}
	}
	return html;
}

export function rowsHtml(t: BootTimeline, o: BootRowOptions): string {
	let html = guidesHtml(t, o.win);
	for (const g of t.groups) {
		const collapsed = !o.expandedModules.has(g.module);
		html +=
			`<div class="boot-group${collapsed ? " boot-collapsed" : ""}" data-group="${escapeHtml(g.module)}">` +
			`<div class="boot-row boot-group-row${o.selectedModule === g.module ? " boot-group-selected" : ""}">` +
			'<span class="boot-label">' +
			caretHtml(true) +
			`<span class="boot-name">${escapeHtml(g.module)}</span>` +
			`<span class="boot-count">${g.spans.length}</span>` +
			"</span>" +
			'<span class="boot-track">' +
			`<span class="boot-group-bar" style="${groupBarStyle(g, o.win)}"></span>` +
			"</span></div>";
		for (const s of g.spans) {
			const matched = spanMatches(s, o.query);
			const expandable = s.deps.length > 0;
			const cascaded = expandable && o.expandedCascades?.has(s.id) === true;
			html +=
				`<div class="boot-row boot-class-row${expandable ? " boot-expandable" : ""}${cascaded ? " boot-expanded" : ""}${matched ? "" : " boot-filtered"}${o.selectedId === s.id ? " boot-selected" : ""}"` +
				` data-id="${escapeHtml(s.id)}">` +
				classLabelHtml(s, 1, expandable) +
				'<span class="boot-track">' +
				classBarHtml(s, o.win) +
				"</span></div>";
			if (cascaded) {
				html += cascadeChildrenHtml(t, s.id, 1, o);
			}
		}
		html += "</div>";
	}
	return html;
}

export function axisHtml(win: BootWindow): string {
	let html = `<span class="boot-axis-zero">${escapeHtml(formatMs(win.from))}</span>`;
	for (const tick of windowTicks(win)) {
		html += `<span class="boot-axis-tick" style="left:${pct(tick, win).toFixed(2)}%">${escapeHtml(formatMs(tick))}</span>`;
	}
	html += `<span class="boot-axis-end">${escapeHtml(formatMs(win.to))}</span>`;
	return html;
}

// The phase lane: tinted segments over the whole boot with their names and
// durations; each carries its range so a click can zoom to it.
export function phaseLaneHtml(t: BootTimeline): string {
	const full: BootWindow = { from: 0, to: t.maxMs };
	let html = "";
	for (const p of t.phases) {
		const left = pct(p.start, full);
		const width = Math.max(pct(p.end, full) - left, 0.1);
		html +=
			`<span class="boot-phase" data-from="${p.start}" data-to="${p.end}"` +
			` style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:rgba(${p.rgb},0.3)">` +
			`<span class="boot-phase-label" style="color:rgb(${p.rgb})">${escapeHtml(p.gloss)} ` +
			`<span class="boot-phase-ms">${escapeHtml(formatMs(p.end - p.start))}</span></span></span>`;
	}
	return html;
}
