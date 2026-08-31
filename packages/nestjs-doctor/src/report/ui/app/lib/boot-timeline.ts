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

/** Group for trace nodes written before the dump's module label was kept. */
export const UNATTRIBUTED_MODULE = "unattributed";

// Largest gap a dependency can finish past its consumer before the bar moves.
const SKEW_MS = 1;

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
	/** The class's module name repeats, so it joined no single graph module. */
	ambiguous?: boolean;
	deps: string[];
	/** Offset from boot start when construction finished (the dump's initTime; a reclocked class gets a synthesized finish). */
	end: number;
	/** The class lives in a package module, one the scanned graph never saw. */
	external?: boolean;
	hooks?: HookTiming[];
	id: string;
	module: string;
	name: string;
	start: number;
	type: string;
	/** The importer of the class's module, when it is not global and has exactly one. */
	via?: string;
	/** Id of the dependency whose finish set this class's start, if any. */
	waitedOn?: string;
}

interface BootGroup {
	ambiguous?: boolean;
	end: number;
	external?: boolean;
	module: string;
	spans: BootSpan[];
	start: number;
}

interface BootPhase {
	/** No class or hook span falls inside the phase. */
	empty: boolean;
	end: number;
	gloss: string;
	label: string;
	rgb: string;
	start: number;
	tip: string;
}

export interface BootTimeline {
	byId: Map<string, BootSpan>;
	groups: BootGroup[];
	maxMs: number;
	phases: BootPhase[];
	scale: TimeScale;
}

export interface BootWindow {
	from: number;
	to: number;
}

// Drops the "<project>/" prefix from a module name.
function bareName(m: { name: string; project?: string }): string {
	return m.project && m.name.startsWith(`${m.project}/`)
		? m.name.slice(m.project.length + 1)
		: m.name;
}

export function buildBootTimeline(
	graph: SerializedModuleGraph
): BootTimeline | null {
	const trace = graph.timingsTrace ?? {};
	if (Object.keys(trace).length === 0) {
		return null;
	}
	const moduleOfId = new Map<string, string>();
	const graphNames = new Set<string>();
	for (const m of graph.modules) {
		graphNames.add(bareName(m));
		for (const t of m.initTimings ?? []) {
			moduleOfId.set(t.id, m.name);
		}
	}
	const byId = new Map<string, BootSpan>();
	for (const [id, node] of Object.entries(trace)) {
		// Deps are sorted slowest first. The start: own finish on a near-tie,
		// the dep's finish when reclocked or waited on, else boot.
		let start = 0;
		let end = node.initTime;
		let waitedOn: string | undefined;
		const slowestId = node.deps.find((d) => Object.hasOwn(trace, d));
		const slowest = slowestId === undefined ? undefined : trace[slowestId];
		if (slowest && slowest.initTime > node.initTime) {
			if (slowest.initTime - node.initTime <= SKEW_MS) {
				// A near-tie past its dependency is wrapper clock skew; the class
				// keeps its own finish with no width.
				start = node.initTime;
				waitedOn = slowestId;
			} else if (node.initTime * 2 < slowest.initTime) {
				// A small own time under a slower dependency is a class clocked
				// from its module's later load start; the bar follows the dep.
				start = slowest.initTime;
				end = slowest.initTime + node.initTime;
				const createEnd = graph.phases?.createMs;
				if (createEnd !== undefined && createEnd > start) {
					// The synthesized finish is capped at the create boundary.
					end = Math.min(end, createEnd);
				}
				waitedOn = slowestId;
			}
		}
		if (waitedOn === undefined) {
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
		}
		const attributed = moduleOfId.get(id);
		// An unattributed label matching no scanned module's bare name is a
		// package module; one that matches is a name the graph could not join.
		const label = attributed === undefined ? node.module : undefined;
		const external = label !== undefined && !graphNames.has(label);
		const ambiguous = label !== undefined && !external;
		byId.set(id, {
			...(ambiguous ? { ambiguous: true } : {}),
			deps: node.deps,
			end,
			...(external ? { external: true } : {}),
			hooks: node.hooks,
			id,
			module: attributed ?? node.module ?? UNATTRIBUTED_MODULE,
			name: node.name,
			start,
			type: node.type,
			...(node.via ? { via: node.via } : {}),
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
	for (const [module, spans] of groupMap) {
		spans.sort((a, b) => a.end - b.end || a.name.localeCompare(b.name));
		let start = Number.POSITIVE_INFINITY;
		let end = 0;
		for (const s of spans) {
			start = Math.min(start, s.start);
			end = Math.max(end, s.end);
			for (const h of s.hooks ?? []) {
				if (typeof h.startMs === "number") {
					end = Math.max(end, h.startMs + h.ms);
				}
			}
		}
		groups.push({
			...(spans.every((s) => s.ambiguous) ? { ambiguous: true } : {}),
			end,
			...(spans.every((s) => s.external) ? { external: true } : {}),
			module,
			spans,
			start,
		});
	}
	// Groups run in the order their first class finished.
	const firstEnd = (g: BootGroup) => (g.spans[0] as BootSpan).end;
	groups.sort(
		(a, b) => firstEnd(a) - firstEnd(b) || a.module.localeCompare(b.module)
	);

	const phases: BootPhase[] = [];
	let prev = 0;
	for (const p of phaseParts(graph)) {
		phases.push({
			empty: false,
			end: prev + p.ms,
			gloss: p.gloss,
			label: p.label,
			rgb: p.rgb,
			start: prev,
			tip: p.tip,
		});
		prev += p.ms;
	}
	const spans = [...byId.values()];
	for (const ph of phases) {
		// A zero-width phase is empty even when an offsetless hook names it.
		ph.empty = ph.end <= ph.start || !spans.some((s) => spanTouches(s, ph));
	}

	const maxMs = Math.max(
		graph.startupMs ?? 0,
		...groups.map((g) => g.end),
		...phases.map((p) => p.end)
	);
	if (maxMs <= 0) {
		return null;
	}
	return { byId, groups, maxMs, phases, scale: buildTimeScale(phases, maxMs) };
}

// A hook without an offset counts toward the phase named for its kind.
function hookBelongs(hook: string, phaseLabel: string): boolean {
	if (
		phaseLabel === "onModuleInit" ||
		phaseLabel === "onApplicationBootstrap"
	) {
		return hook === phaseLabel;
	}
	return phaseLabel !== "create" && phaseLabel !== "listen";
}

function spanTouches(s: BootSpan, ph: BootPhase): boolean {
	const inside = (from: number, to: number) => from < ph.end && to > ph.start;
	if (inside(s.start, s.end)) {
		return true;
	}
	return (s.hooks ?? []).some((h) =>
		typeof h.startMs === "number"
			? inside(h.startMs, h.startMs + h.ms)
			: hookBelongs(h.hook, ph.label)
	);
}

/** Ids of every class whose dependencies can be cascaded open. */
export function expandableIds(t: BootTimeline): Set<string> {
	return new Set(
		[...t.byId.values()].filter((s) => s.deps.length > 0).map((s) => s.id)
	);
}

export interface ModuleTiming {
	/** Own construction of the module's slowest class, after its dependencies. */
	buildMs: number;
	/** Hook time across the module's classes, by hook kind, in dump order. */
	hooks: { label: string; ms: number }[];
}

// Total covered length of possibly overlapping [start, end] intervals.
function unionMs(intervals: [number, number][]): number {
	intervals.sort((a, b) => a[0] - b[0]);
	let total = 0;
	let coveredTo = Number.NEGATIVE_INFINITY;
	for (const [from, to] of intervals) {
		total += Math.max(0, to - Math.max(from, coveredTo));
		coveredTo = Math.max(coveredTo, to);
	}
	return total;
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
		// Overlapping runs count once; hooks without an offset add their ms.
		const hooks = new Map<
			string,
			{ loose: number; runs: [number, number][] }
		>();
		for (const s of g.spans) {
			buildMs = Math.max(buildMs, s.end - s.start);
			for (const h of s.hooks ?? []) {
				const label = hookMeta(h.hook).label;
				const entry = hooks.get(label) ?? { loose: 0, runs: [] };
				if (typeof h.startMs === "number") {
					entry.runs.push([h.startMs, h.startMs + h.ms]);
				} else {
					entry.loose += h.ms;
				}
				hooks.set(label, entry);
			}
		}
		out.set(g.module, {
			buildMs,
			hooks: [...hooks].map(([label, e]) => ({
				label,
				ms: e.loose + unionMs(e.runs),
			})),
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

/** Window centered on a span with context around it, clamped to the boot. */
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

/** Inline left/width percentages for a bar, relative to the window. */
function barStyle(
	start: number,
	end: number,
	win: BootWindow,
	minWidth: number
): string {
	const left = pct(start, win);
	const width = Math.max(pct(end, win) - left, minWidth);
	return `left:${left.toFixed(3)}%;width:${width.toFixed(3)}%`;
}

// Every bar carries the time it took, inside it; narrow bars clip the text.
function classBarHtml(span: BootSpan, win: BootWindow, sc: TimeScale): string {
	const barFrom = u(sc, span.start);
	const barTo = u(sc, span.end, true);
	const segs: [number, number][] = [[barFrom, barTo]];
	let hookHtml = "";
	(span.hooks ?? []).forEach((h, index) => {
		if (typeof h.startMs !== "number") {
			return;
		}
		const from = u(sc, h.startMs);
		const to = u(sc, h.startMs + h.ms, true);
		segs.push([from, to]);
		const meta = hookMeta(h.hook);
		hookHtml +=
			`<span class="boot-hook-span" data-hook="${index}"` +
			` style="${barStyle(from, to, win, 0.12)};background:rgb(${fillOf(meta.rgb)})">` +
			`${escapeHtml(`+${formatMs(h.ms)} ${meta.label}`)}</span>`;
	});
	let html = "";
	if (!segs.some(([a, b]) => pct(b, win) >= 0 && pct(a, win) <= 100)) {
		if (segs.some(([, b]) => pct(b, win) < 0)) {
			html += '<span class="boot-offscreen boot-offscreen-l"></span>';
		}
		if (segs.some(([a]) => pct(a, win) > 100)) {
			html += '<span class="boot-offscreen boot-offscreen-r"></span>';
		}
	}
	return (
		html +
		`<span class="boot-bar" style="${barStyle(barFrom, barTo, win, 0.12)};background:rgb(${fillOf(spanColor(span.type))})">` +
		`${escapeHtml(formatMs(span.end - span.start))}</span>` +
		hookHtml
	);
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
		"</span>"
	);
}

/** Guides at each phase handover: a dotted line, or a weave band at a 0ms phase. */
function guidesHtml(t: BootTimeline, win: BootWindow): string {
	// Instants where a zero-length phase sits; their guide is its weave band.
	const zeroAt = new Set(
		t.phases.filter((p) => p.end <= p.start).map((p) => p.start)
	);
	const s = t.scale;
	let html = "";
	let lastAt = Number.NaN;
	for (const p of t.phases.slice(1)) {
		// Two phases meeting at one instant draw one line.
		if (p.start === lastAt) {
			continue;
		}
		lastAt = p.start;
		const zero = zeroAt.has(p.start);
		// Left and right land on the edges of a zero band, or on the same point.
		const left = pct(u(s, p.start, true), win);
		const right = pct(u(s, p.start), win);
		if (right < 0 || left > 100) {
			continue;
		}
		const cls = zero ? "boot-guide boot-guide-zero" : "boot-guide";
		const band = zero ? `;width:${(right - left).toFixed(3)}%` : "";
		html += `<span class="${cls}" style="left:${left.toFixed(3)}%${band};border-color:rgba(${p.rgb},0.6)"><span class="boot-guide-ms" style="color:rgba(${p.rgb},0.95)">${escapeHtml(formatMs(p.start))}</span></span>`;
	}
	return html ? `<span class="boot-guides">${html}</span>` : "";
}

// A cascade row is a deduped shadow of the class's own row in its group.
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
		// Finished after its consumer: built earlier, for another consumer.
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
			classBarHtml(dep, o.win, t.scale) +
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

function groupTagHtml(g: BootGroup): string {
	if (g.external) {
		return '<span class="boot-reused-tag">external</span>';
	}
	if (g.ambiguous) {
		return '<span class="boot-reused-tag">ambiguous</span>';
	}
	return "";
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
			groupTagHtml(g) +
			`<span class="boot-count">${g.spans.length}</span>` +
			"</span>" +
			'<span class="boot-track">' +
			`<span class="boot-group-bar" style="${barStyle(u(t.scale, g.start), u(t.scale, g.end, true), o.win, 0.1)}"></span>` +
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
				classBarHtml(s, o.win, t.scale) +
				"</span></div>";
			if (cascaded) {
				html += cascadeChildrenHtml(t, s.id, 1, o);
			}
		}
		html += "</div>";
	}
	return html;
}

export function axisHtml(win: BootWindow, s?: TimeScale): string {
	let html = "";
	if (s && !s.linear) {
		// The widened stretches, marked with the weave in the axis lane too.
		for (let i = 0; i < s.inflated.length; i++) {
			if (!s.inflated[i]) {
				continue;
			}
			const left = pct(s.us[i], win);
			const right = pct(s.us[i + 1], win);
			if (right < 0 || left > 100) {
				continue;
			}
			html += `<span class="boot-axis-warp" style="left:${left.toFixed(3)}%;width:${(right - left).toFixed(3)}%"></span>`;
		}
	}
	const from = s ? tOf(s, win.from) : win.from;
	const to = s ? tOf(s, win.to) : win.to;
	html += `<span class="boot-axis-zero">${escapeHtml(formatMs(from))}</span>`;
	for (const tick of windowTicks({ from, to })) {
		const left = s ? pct(u(s, tick), win) : pct(tick, win);
		// Warped ticks keep clear of the edge labels in display space.
		if (left < 5 || left > 94) {
			continue;
		}
		html += `<span class="boot-axis-tick" style="left:${left.toFixed(2)}%">${escapeHtml(formatMs(tick))}</span>`;
	}
	html += `<span class="boot-axis-end">${escapeHtml(formatMs(to))}</span>`;
	return html;
}

// Narrowest a phase segment draws, as a share of the lane; an empty one
// gets more room so its weave shows.
const PHASE_MIN_PCT = 0.6;
const EMPTY_PHASE_MIN_PCT = 8;

/** Monotone piecewise map from true ms to display ms; identity when linear. */
export interface TimeScale {
	/** Per segment: the column was widened past its true share. */
	inflated: boolean[];
	/** No segment was widened, so display time equals true time. */
	linear: boolean;
	maxMs: number;
	/** Segment edges in true ms, ascending; an equal pair is a 0ms phase. */
	ts: number[];
	/** The same edges in display ms; the last one is maxMs. */
	us: number[];
}

// The lane's donation pass: every column gets at least its minimum share,
// paid for by the columns with slack, in proportion to their slack.
function buildTimeScale(phases: BootPhase[], maxMs: number): TimeScale {
	if (phases.length === 0 || maxMs <= 0) {
		return {
			inflated: [],
			linear: true,
			maxMs,
			ts: [0, maxMs],
			us: [0, maxMs],
		};
	}
	const last = phases.at(-1) as BootPhase;
	const budget = (last.end / maxMs) * 100;
	const nat = phases.map((p) => ((p.end - p.start) / maxMs) * 100);
	let mins: number[] = phases.map((p) =>
		p.empty ? EMPTY_PHASE_MIN_PCT : PHASE_MIN_PCT
	);
	const minSum = mins.reduce((a, b) => a + b, 0);
	if (minSum > budget) {
		mins = mins.map((m) => (m * budget) / minSum);
	}
	const widths = nat.map((w, i) => Math.max(w, mins[i]));
	const excess = widths.reduce((a, b) => a + b, 0) - budget;
	if (excess > 0) {
		const slack = widths.map((w, i) => w - mins[i]);
		const slackSum = slack.reduce((a, b) => a + b, 0);
		for (let i = 0; i < widths.length; i++) {
			widths[i] -= (slack[i] * excess) / slackSum;
		}
	}
	const inflated = widths.map((w, i) => w > nat[i] + 1e-9);
	const ts = [0, ...phases.map((p) => p.end)];
	const us = [0];
	let acc = 0;
	for (const w of widths) {
		acc += w;
		us.push((acc / 100) * maxMs);
	}
	if (last.end < maxMs) {
		ts.push(maxMs);
		us.push(maxMs);
		inflated.push(false);
	} else {
		us[us.length - 1] = maxMs;
	}
	return { inflated, linear: !inflated.some(Boolean), maxMs, ts, us };
}

/** True to display ms; an end lands left of a 0ms band, a start lands right. */
export function u(s: TimeScale, t: number, atEnd = false): number {
	if (s.linear) {
		return t;
	}
	const n = s.ts.length;
	if (t <= s.ts[0]) {
		return s.us[0];
	}
	if (t >= s.ts[n - 1]) {
		return s.us[n - 1];
	}
	if (atEnd) {
		for (let i = 1; i < n; i++) {
			const b = s.ts[i];
			if (b === t) {
				return s.us[i];
			}
			if (b > t) {
				const a = s.ts[i - 1];
				const ua = s.us[i - 1];
				return ua + ((t - a) / (b - a)) * (s.us[i] - ua);
			}
		}
	}
	for (let i = n - 1; i >= 0; i--) {
		const a = s.ts[i];
		if (a === t) {
			return s.us[i];
		}
		if (a < t) {
			const b = s.ts[i + 1];
			const ua = s.us[i];
			return ua + ((t - a) / (b - a)) * (s.us[i + 1] - ua);
		}
	}
	return t;
}

/** Display ms back to true ms; constant across a 0ms band. */
export function tOf(s: TimeScale, x: number): number {
	if (s.linear) {
		return x;
	}
	const n = s.us.length;
	if (x <= s.us[0]) {
		return s.ts[0];
	}
	if (x >= s.us[n - 1]) {
		return s.ts[n - 1];
	}
	for (let i = 0; i < n - 1; i++) {
		const b = s.us[i + 1];
		if (x <= b) {
			const a = s.us[i];
			const ta = s.ts[i];
			const tb = s.ts[i + 1];
			if (tb === ta || b === a) {
				return ta;
			}
			return ta + ((x - a) / (b - a)) * (tb - ta);
		}
	}
	return x;
}

// The phase lane: tinted segments over the boot; each carries its index
// so a click can frame it, and a tip that names a too-narrow segment.
// Length of the phase its class bars and hook spans cover.
function phaseCoverageMs(t: BootTimeline, ph: BootPhase): number {
	const intervals: [number, number][] = [];
	const clip = (from: number, to: number) => {
		const f = Math.max(from, ph.start);
		const e = Math.min(to, ph.end);
		if (e > f) {
			intervals.push([f, e]);
		}
	};
	for (const s of t.byId.values()) {
		clip(s.start, s.end);
		for (const h of s.hooks ?? []) {
			if (typeof h.startMs === "number") {
				clip(h.startMs, h.startMs + h.ms);
			}
		}
	}
	return unionMs(intervals);
}

export function phaseLaneHtml(t: BootTimeline): string {
	if (t.phases.length === 0) {
		return "";
	}
	const s = t.scale;
	let html = "";
	t.phases.forEach((p, i) => {
		const left = (s.us[i] / s.maxMs) * 100;
		const width = ((s.us[i + 1] - s.us[i]) / s.maxMs) * 100;
		const trueMs = p.end - p.start;
		const zero = trueMs <= 0;
		const ms = zero ? "0ms" : formatMs(trueMs);
		const inflated = s.inflated[i] === true;
		const covered = p.empty ? 0 : phaseCoverageMs(t, p);
		const short = !p.empty && covered < trueMs * 0.95;
		const coveredMs = covered <= 0 ? "0ms" : formatMs(covered);
		const msLabel = short ? `${ms} · ${coveredMs} in classes` : ms;
		let tip = `${ms} · ${p.tip}`;
		if (zero) {
			tip += " · no time elapsed between the markers";
		} else if (p.empty) {
			tip += " · nothing ran inside";
		} else if (short) {
			tip += ` · ${formatMs(trueMs - covered)} not covered by any class bar`;
		}
		if (inflated) {
			tip += " · column widened to stay readable";
		}
		const fill = p.empty ? "" : `;background:rgba(${p.rgb},0.3)`;
		const ink = p.empty ? "rgba(255,255,255,0.45)" : `rgb(${p.rgb})`;
		const classes = `boot-phase${p.empty ? " boot-phase-empty" : ""}${inflated ? " boot-phase-inflated" : ""}`;
		html +=
			`<span class="${classes}"` +
			` data-tip="${escapeHtml(tip)}"` +
			` style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%${fill}"` +
			` data-index="${i}">` +
			`<span class="boot-phase-label" style="color:${ink}">` +
			`<span class="boot-phase-gloss">${escapeHtml(p.gloss)}</span>` +
			`<span class="boot-phase-ms">${escapeHtml(msLabel)}</span></span></span>`;
	});
	return html;
}
