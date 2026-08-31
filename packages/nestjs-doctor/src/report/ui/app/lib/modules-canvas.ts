import type {
	ReportArtifact,
	SerializedModuleGraph,
	SerializedModuleNode,
} from "../../../../common/artifact.js";
import { bareModuleName } from "../../../../common/artifact.js";
import { REPORT_FONT_STACK } from "../../font.js";
import {
	type ModuleTiming,
	moduleTimingLabel,
	moduleTimingLines,
	moduleTimings,
} from "./boot-timeline.js";
import { escapeHtml } from "./escape.js";
import { computeLayout, reverseIndex } from "./module-layout.js";

export const MG_EXTERNAL_PROJECT = "(external)";
const MG_INTRA_EDGE = "#444";
const MG_CROSS_EDGE = "#22d3ee";
const MG_CYCLE = "#ea2845";
const MG_GLOBAL = "#fbbf24";
const MG_NODE_H = 40;
const MG_SUB_LINE_H = 12;
const MG_SEL_OUT = "#60a5fa";
const MG_SEL_IN = "#34d399";
const PROJECT_COLORS = [
	"#3b82f6",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#14b8a6",
	"#f97316",
];

export interface MgNode extends SerializedModuleNode {
	external?: boolean;
	h: number;
	label?: string;
	/** Lines under the name: counts first, then one per boot timing. */
	subLines?: string[];
	w: number;
	x: number;
	y: number;
}

interface MgEdge {
	cross: boolean;
	cycle: boolean;
	ext: boolean;
	from: string;
	label: string | null;
	to: string;
}

export function displayName(n: { name: string; project?: string }): string {
	return bareModuleName(n);
}

function buildProjectColorMap(
	graph: SerializedModuleGraph
): Record<string, string> {
	const map: Record<string, string> = {};
	for (let i = 0; i < graph.projects.length; i++) {
		map[graph.projects[i] as string] = PROJECT_COLORS[
			i % PROJECT_COLORS.length
		] as string;
	}
	map[MG_EXTERNAL_PROJECT] = "#6b7280";
	return map;
}

interface ModulesCanvasCallbacks {
	/** The canvas picked a module (click) or cleared the selection. */
	onSelect: (name: string | null) => void;
	onZoom: (pct: number) => void;
}

// The imperative half of the Modules Graph tab: build, camera flights,
// painting and hit testing. React owns the sidebar, detail panel and dock.
export class ModulesCanvas {
	readonly nodes: MgNode[] = [];
	readonly nodeMap: Record<string, MgNode> = {};
	readonly importers: Record<string, string[]>;
	readonly circularModules = new Set<string>();
	readonly rootModules = new Set<string>();
	private readonly moduleTimings: Map<string, ModuleTiming>;
	private readonly circularEdges = new Set<string>();
	private readonly globalNames: string[] = [];
	private readonly edges: MgEdge[] = [];
	private readonly clusters: ReturnType<typeof computeLayout>;
	private readonly graph: SerializedModuleGraph;
	private readonly projectColorMap: Record<string, string>;
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D | null;
	private readonly tooltipEl: HTMLElement;
	private readonly callbacks: ModulesCanvasCallbacks;
	private readonly dpr: number;
	private w = 0;
	private h = 0;
	private camX = 0;
	private camY = 0;
	private zoom = 1;
	private minZoom = 0.2;
	private panning = false;
	private panStart = { x: 0, y: 0 };
	private panMoved = false;
	selected: MgNode | null = null;
	private hovered: MgNode | null = null;
	hideExternal = true;
	private showGlobals = false;
	private matches: Record<string, boolean> | null = null;
	private focusSet: Record<string, boolean> | null = null;
	private hoverImport: string | null = null;
	private hoverUsedBy: string | null = null;
	private cycleFocus: Record<string, boolean> | null = null;
	private dashT = 0;
	private hoverAnimOn = false;
	private dirty = false;
	private flightToken = 0;
	private lastZoomUi: number | null = null;
	private readonly disposers: (() => void)[] = [];

	constructor(options: {
		callbacks: ModulesCanvasCallbacks;
		canvas: HTMLCanvasElement;
		report: ReportArtifact;
		tooltipEl: HTMLElement;
	}) {
		this.canvas = options.canvas;
		this.tooltipEl = options.tooltipEl;
		this.callbacks = options.callbacks;
		this.graph = options.report.graph;
		this.moduleTimings = moduleTimings(this.graph);
		this.ctx = this.canvas.getContext("2d");
		this.dpr = window.devicePixelRatio || 1;
		this.projectColorMap = buildProjectColorMap(this.graph);

		for (const cycle of this.graph.circularDeps) {
			for (let i = 0; i < cycle.length; i++) {
				this.circularModules.add(cycle[i] as string);
				const next = cycle[(i + 1) % cycle.length] as string;
				this.circularEdges.add(`${cycle[i]}->${next}`);
			}
		}
		const importedBy = new Set(this.graph.edges.map((e) => e.to));
		for (const m of this.graph.modules) {
			if (!importedBy.has(m.name) || m.name === "AppModule") {
				this.rootModules.add(m.name);
			}
		}
		for (const r of this.graph.bootstrapRoots ?? []) {
			this.rootModules.add(r);
		}

		// Build nodes, synthetic package modules, and typed edges.
		for (const m of this.graph.modules) {
			const n: MgNode = {
				...m,
				imports: m.imports || [],
				exports: m.exports || [],
				providers: m.providers || [],
				providerTokens: m.providerTokens || [],
				controllers: m.controllers || [],
				isGlobal: Boolean(m.isGlobal),
				project: m.project || "",
				x: 0,
				y: 0,
				w: 0,
				h: MG_NODE_H,
			};
			this.measureNode(n);
			this.nodes.push(n);
			this.nodeMap[n.name] = n;
			if (n.isGlobal) {
				this.globalNames.push(n.name);
			}
		}
		const declaredCount = this.nodes.length;
		const extEdges: { from: string; to: string }[] = [];
		for (let i = 0; i < declaredCount; i++) {
			const srcNode = this.nodes[i] as MgNode;
			for (const targetName of srcNode.imports) {
				if (!this.nodeMap[targetName]) {
					const xn: MgNode = {
						name: targetName,
						project: MG_EXTERNAL_PROJECT,
						filePath: "",
						line: 0,
						isGlobal: false,
						external: true,
						imports: [],
						exports: [],
						providers: [],
						providerTokens: [],
						controllers: [],
						x: 0,
						y: 0,
						w: 0,
						h: MG_NODE_H,
					};
					this.measureNode(xn);
					xn.subLines = ["package"];
					this.nodes.push(xn);
					this.nodeMap[targetName] = xn;
				}
				if ((this.nodeMap[targetName] as MgNode).external) {
					extEdges.push({ from: srcNode.name, to: targetName });
				}
			}
		}
		const allEdges = this.graph.edges.concat(extEdges);
		for (const e of allEdges) {
			const a = this.nodeMap[e.from];
			const b = this.nodeMap[e.to];
			if (!(a && b)) {
				continue;
			}
			this.edges.push({
				from: e.from,
				to: e.to,
				ext: Boolean(a.external || b.external),
				cross: !(a.external || b.external) && a.project !== b.project,
				cycle: this.circularEdges.has(`${e.from}->${e.to}`),
				label: a.dynamicImports?.[e.to] || null,
			});
		}
		this.importers = reverseIndex(allEdges);
		const dagre = (globalThis as { dagre?: unknown }).dagre;
		this.clusters = computeLayout(
			this.nodes,
			allEdges,
			dagre as Parameters<typeof computeLayout>[2]
		);
		this.bindEvents();
	}

	destroy(): void {
		for (const dispose of this.disposers) {
			dispose();
		}
	}

	// ── React-driven entry points ──

	init(): void {
		this.resize();
		this.centerCamera();
		this.scheduleRedraw();
	}

	resize(): void {
		if (!this.ctx) {
			return;
		}
		const wrap = this.canvas.parentElement;
		if (!wrap) {
			return;
		}
		const w = wrap.clientWidth;
		const h = wrap.clientHeight;
		if (w === 0 || h === 0) {
			return;
		}
		// Resetting canvas.width clears the bitmap; skip when geometry is unchanged.
		if (w === this.w && h === this.h) {
			this.scheduleRedraw();
			return;
		}
		// The draw transform scales around the canvas centre, so shift the
		// camera to keep every world point at its screen position.
		if (this.w > 0 && this.h > 0) {
			this.camX += ((w - this.w) / 2) * (1 - 1 / this.zoom);
			this.camY += ((h - this.h) / 2) * (1 - 1 / this.zoom);
		}
		this.w = w;
		this.h = h;
		this.canvas.width = this.w * this.dpr;
		this.canvas.height = this.h * this.dpr;
		this.canvas.style.width = `${this.w}px`;
		this.canvas.style.height = `${this.h}px`;
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		this.scheduleRedraw();
	}

	recenter(): void {
		this.centerCamera();
		this.scheduleRedraw();
	}

	zoomIn(): void {
		this.zoom = Math.min(5, this.zoom * 1.2);
		this.scheduleRedraw();
	}

	zoomOut(): void {
		this.zoom = Math.max(Math.min(this.minZoom, 0.05), this.zoom / 1.2);
		this.scheduleRedraw();
	}

	setZoomPct(pct: number): void {
		this.zoom = Math.max(Math.min(this.minZoom, 0.05), pct / 100);
		this.scheduleRedraw();
	}

	applySearch(raw: string): void {
		const q = (raw || "").trim().toLowerCase();
		if (q === "") {
			this.matches = null;
			this.scheduleRedraw();
			return;
		}
		this.matches = {};
		let first: MgNode | null = null;
		for (const n of this.nodes) {
			if (this.hideExternal && n.external) {
				continue;
			}
			if (n.name.toLowerCase().includes(q)) {
				this.matches[n.name] = true;
				first ??= n;
			}
		}
		if (first) {
			this.panTo(first);
		}
		this.scheduleRedraw();
	}

	setShowGlobals(show: boolean): void {
		this.showGlobals = show;
		this.scheduleRedraw();
	}

	setHideExternal(hide: boolean): void {
		this.hideExternal = hide;
		if (hide && this.selected?.external) {
			this.clearSelection();
			this.callbacks.onSelect(null);
		}
		this.scheduleRedraw();
	}

	/** Selects a node: focus set, hover animation, and an optional flight. */
	selectNode(name: string, fly: boolean): MgNode | null {
		const n = this.nodeMap[name];
		if (!n) {
			return null;
		}
		this.selected = n;
		this.cycleFocus = null;
		this.focusSet = { [n.name]: true };
		for (const e of this.edges) {
			if (e.from === n.name) {
				this.focusSet[e.to] = true;
			}
			if (e.to === n.name) {
				this.focusSet[e.from] = true;
			}
		}
		this.startHoverAnim();
		if (fly) {
			this.flyToNode(n);
		}
		this.scheduleRedraw();
		return n;
	}

	clearSelection(): void {
		this.selected = null;
		this.focusSet = null;
		this.cycleFocus = null;
		this.scheduleRedraw();
	}

	setDetailHover(importName: string | null, usedByName: string | null): void {
		if (importName !== this.hoverImport || usedByName !== this.hoverUsedBy) {
			this.hoverImport = importName;
			this.hoverUsedBy = usedByName;
			if (importName !== null || usedByName !== null) {
				this.startHoverAnim();
			}
			this.scheduleRedraw();
		}
	}

	focusCycle(names: string[]): void {
		this.cycleFocus = {};
		for (const name of names) {
			this.cycleFocus[name] = true;
		}
		this.fitNodes(names);
	}

	// ── Ported internals ──

	private measureNode(n: MgNode): void {
		const ctx = this.ctx;
		if (!ctx) {
			return;
		}
		const label = displayName(n);
		const subLines = [`${n.providers.length}p · ${n.controllers.length}c`];
		// Skips the timing lines for a package node; the tooltip still shows its timing.
		const timing = n.external ? undefined : this.moduleTimings.get(n.name);
		if (timing) {
			subLines.push(...moduleTimingLines(timing));
		}
		ctx.font = `bold 12px ${REPORT_FONT_STACK}`;
		let widest = ctx.measureText(label).width;
		ctx.font = `10px ${REPORT_FONT_STACK}`;
		for (const line of subLines) {
			widest = Math.max(widest, ctx.measureText(line).width);
		}
		n.label = label;
		n.subLines = subLines;
		n.w = Math.max(112, widest + 28);
		n.h = MG_NODE_H + (subLines.length - 1) * MG_SUB_LINE_H;
	}

	private scheduleRedraw(): void {
		if (!this.dirty) {
			this.dirty = true;
			requestAnimationFrame(() => {
				this.dirty = false;
				this.draw();
			});
		}
	}

	private bounds(nodes: MgNode[]): {
		maxX: number;
		maxY: number;
		minX: number;
		minY: number;
	} {
		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const n of nodes) {
			minX = Math.min(minX, n.x - n.w / 2);
			maxX = Math.max(maxX, n.x + n.w / 2);
			minY = Math.min(minY, n.y - n.h / 2);
			maxY = Math.max(maxY, n.y + n.h / 2);
		}
		return { minX, maxX, minY, maxY };
	}

	private centerCamera(): void {
		if (this.nodes.length === 0 || this.w === 0) {
			return;
		}
		const visible = this.nodes.filter(
			(n) => !(this.hideExternal && n.external)
		);
		const b = this.bounds(visible.length ? visible : this.nodes);
		const gw = b.maxX - b.minX;
		const gh = b.maxY - b.minY;
		const fit = Math.min(
			1.4,
			Math.min((this.w * 0.9) / (gw || 1), (this.h * 0.9) / (gh || 1))
		);
		this.minZoom = Math.min(0.2, fit);
		this.zoom = Math.max(this.minZoom, fit);
		this.camX = this.w / 2 - (b.minX + b.maxX) / 2;
		this.camY = this.h / 2 - (b.minY + b.maxY) / 2;
	}

	private screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: (sx - this.w / 2) / this.zoom + this.w / 2 - this.camX,
			y: (sy - this.h / 2) / this.zoom + this.h / 2 - this.camY,
		};
	}

	private panTo(n: MgNode): void {
		this.camX = this.w / 2 - n.x;
		this.camY = this.h / 2 - n.y;
		this.scheduleRedraw();
	}

	private flyTo(
		targetCamX: number,
		targetCamY: number,
		targetZoom: number
	): void {
		const token = ++this.flightToken;
		// Hidden documents get no animation frames; jump instead of stalling.
		if (document.visibilityState === "hidden") {
			this.camX = targetCamX;
			this.camY = targetCamY;
			this.zoom = targetZoom;
			this.draw();
			return;
		}
		const fromX = this.camX;
		const fromY = this.camY;
		const fromZ = this.zoom;
		let start: number | null = null;
		const DURATION = 280;
		const step = (ts: number) => {
			if (token !== this.flightToken) {
				return;
			}
			if (start === null) {
				start = ts;
			}
			const t = Math.min(1, (ts - start) / DURATION);
			const e = t * (2 - t);
			this.camX = fromX + (targetCamX - fromX) * e;
			this.camY = fromY + (targetCamY - fromY) * e;
			this.zoom = fromZ + (targetZoom - fromZ) * e;
			this.draw();
			if (t < 1) {
				requestAnimationFrame(step);
			}
		};
		requestAnimationFrame(step);
	}

	/** Center one node at a readable zoom, the way picking a schema table does. */
	private flyToNode(n: MgNode): void {
		const zoom = Math.min(1.2, Math.max(this.zoom, 0.85));
		this.flyTo(this.w / 2 - n.x, this.h / 2 - n.y, zoom);
	}

	/** Fit a set of module names in view, with padding. */
	private fitNodes(names: string[]): void {
		const nodes: MgNode[] = [];
		for (const name of names) {
			const node = this.nodeMap[name];
			if (node) {
				nodes.push(node);
			}
		}
		if (nodes.length === 0) {
			return;
		}
		const b = this.bounds(nodes);
		const gw = b.maxX - b.minX + 160;
		const gh = b.maxY - b.minY + 160;
		const zoom = Math.min(1.2, Math.min(this.w / gw, this.h / gh));
		this.flyTo(
			this.w / 2 - (b.minX + b.maxX) / 2,
			this.h / 2 - (b.minY + b.maxY) / 2,
			Math.max(this.minZoom, zoom)
		);
	}

	private syncZoomUi(): void {
		const pct = Math.round(this.zoom * 100);
		if (pct === this.lastZoomUi) {
			return;
		}
		this.lastZoomUi = pct;
		this.callbacks.onZoom(pct);
	}

	private nodeAlpha(n: MgNode): number {
		if (this.hideExternal && n.external) {
			return 0;
		}
		let a = 1;
		if (this.matches && !this.matches[n.name]) {
			a = Math.min(a, 0.1);
		}
		if (this.focusSet && !this.focusSet[n.name]) {
			a = Math.min(a, 0.13);
		}
		return a;
	}

	private edgeAlpha(e: MgEdge): number {
		const a = this.nodeMap[e.from];
		const b = this.nodeMap[e.to];
		if (!(a && b)) {
			return 0;
		}
		if (this.hideExternal && e.ext) {
			return 0;
		}
		if (this.focusSet && this.selected) {
			return e.from === this.selected.name || e.to === this.selected.name
				? 1
				: 0.05;
		}
		const aa = this.nodeAlpha(a);
		const ba = this.nodeAlpha(b);
		// A cross-project edge that still touches something visible stays readable.
		let base: number;
		if (aa === ba) {
			base = aa;
		} else if (Math.max(aa, ba) === 1) {
			base = 0.55;
		} else {
			base = Math.min(aa, ba);
		}
		// Cross-project edges render dimmer.
		return e.cross ? base * 0.42 : base;
	}

	private rect(x: number, y: number, w: number, h: number): void {
		const ctx = this.ctx as CanvasRenderingContext2D;
		ctx.beginPath();
		ctx.rect(x, y, w, h);
	}

	/** Where the line from a node's centre towards a point leaves its box. */
	private boxPort(n: MgNode, tx: number, ty: number): { x: number; y: number } {
		const dx = tx - n.x;
		const dy = ty - n.y;
		if (dx === 0 && dy === 0) {
			return { x: n.x, y: n.y };
		}
		const sx = dx === 0 ? Number.POSITIVE_INFINITY : n.w / 2 / Math.abs(dx);
		const sy = dy === 0 ? Number.POSITIVE_INFINITY : n.h / 2 / Math.abs(dy);
		const s = Math.min(sx, sy);
		return { x: n.x + dx * s, y: n.y + dy * s };
	}

	private drawArrow(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		color: string,
		dash: number[],
		width: number
	): void {
		const ctx = this.ctx as CanvasRenderingContext2D;
		const angle = Math.atan2(toY - fromY, toX - fromX);
		ctx.beginPath();
		ctx.setLineDash(dash);
		ctx.moveTo(fromX, fromY);
		ctx.lineTo(toX, toY);
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.stroke();
		ctx.setLineDash([]);
		const head = 8;
		ctx.beginPath();
		ctx.moveTo(toX, toY);
		ctx.lineTo(
			toX - head * Math.cos(angle - 0.4),
			toY - head * Math.sin(angle - 0.4)
		);
		ctx.lineTo(
			toX - head * Math.cos(angle + 0.4),
			toY - head * Math.sin(angle + 0.4)
		);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
	}

	private drawClusters(): void {
		const ctx = this.ctx as CanvasRenderingContext2D;
		for (const c of this.clusters) {
			if (this.hideExternal && c.key === MG_EXTERNAL_PROJECT) {
				continue;
			}
			const color = c.key ? this.projectColorMap[c.key] || "#555" : "#555";
			ctx.globalAlpha = 0.5;
			this.rect(c.x, c.y, c.w, c.h);
			ctx.fillStyle = "rgba(255,255,255,0.022)";
			ctx.fill();
			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.setLineDash([]);
			ctx.stroke();
			if (c.key) {
				ctx.globalAlpha = 1;
				ctx.fillStyle = color;
				ctx.font = `bold 12px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText(c.key, c.x + 12, c.y + 15);
				ctx.fillStyle = "#666";
				ctx.font = `10px ${REPORT_FONT_STACK}`;
				ctx.fillText(
					c.nodes.length + (c.nodes.length === 1 ? " module" : " modules"),
					c.x + 16 + ctx.measureText(c.key).width * 1.15,
					c.y + 15
				);
			}
		}
		ctx.globalAlpha = 1;
	}

	private drawGlobalReach(): void {
		if (!this.showGlobals || this.globalNames.length === 0) {
			return;
		}
		const ctx = this.ctx as CanvasRenderingContext2D;
		for (const name of this.globalNames) {
			const src = this.nodeMap[name];
			if (!src) {
				continue;
			}
			// Halo around each @Global() source.
			ctx.globalAlpha = 0.9;
			ctx.beginPath();
			ctx.rect(
				src.x - src.w / 2 - 5,
				src.y - src.h / 2 - 5,
				src.w + 10,
				src.h + 10
			);
			ctx.strokeStyle = MG_GLOBAL;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.globalAlpha = 0.45;
			for (const dst of this.nodes) {
				if (dst === src || dst.imports.includes(src.name)) {
					continue;
				}
				const a = this.boxPort(src, dst.x, dst.y);
				const b = this.boxPort(dst, src.x, src.y);
				ctx.beginPath();
				ctx.setLineDash([2, 4]);
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.strokeStyle = MG_GLOBAL;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
		ctx.globalAlpha = 1;
	}

	private drawEdges(): void {
		const ctx = this.ctx as CanvasRenderingContext2D;
		const labels: { alpha: number; text: string; x: number; y: number }[] = [];
		for (const e of this.edges) {
			let alpha = this.edgeAlpha(e);
			if (alpha <= 0) {
				continue;
			}
			const a = this.nodeMap[e.from] as MgNode;
			const b = this.nodeMap[e.to] as MgNode;
			const p1 = this.boxPort(a, b.x, b.y);
			const p2 = this.boxPort(b, a.x, a.y);
			let color = MG_INTRA_EDGE;
			let dash: number[] = [];
			if (e.cross) {
				color = MG_CROSS_EDGE;
				dash = [7, 5];
			}
			if (e.cycle) {
				color = MG_CYCLE;
				dash = [5, 4];
			}
			if (e.ext && !e.cycle) {
				color = "#6b7280";
				dash = [3, 4];
			}
			let lineWidth = e.cross || e.cycle ? 1.6 : 1.3;
			// Selection edges split by direction: imports vs used-by.
			// Arrowheads and dashes keep the import direction, importer to imported.
			let isSelEdge = false;
			if (this.selected && !e.cycle) {
				if (e.from === this.selected.name) {
					color = MG_SEL_OUT;
					isSelEdge = true;
				} else if (e.to === this.selected.name) {
					color = MG_SEL_IN;
					isSelEdge = true;
				}
			}
			// A focused cycle takes over: its edges burn bright, the rest recede.
			if (this.cycleFocus) {
				if (e.cycle && this.cycleFocus[e.from] && this.cycleFocus[e.to]) {
					lineWidth = 3;
					ctx.lineDashOffset = this.dashT;
					ctx.globalAlpha = 1;
					this.drawArrow(p1.x, p1.y, p2.x, p2.y, MG_CYCLE, [6, 5], lineWidth);
					ctx.lineDashOffset = 0;
					continue;
				}
				alpha *= 0.15;
			}
			if (isSelEdge) {
				lineWidth = 2.2;
				dash = [9, 6];
				alpha = Math.max(alpha, 0.95);
			}
			ctx.globalAlpha = alpha;
			if (isSelEdge) {
				ctx.lineDashOffset = -this.dashT;
				this.drawArrow(p1.x, p1.y, p2.x, p2.y, color, dash, lineWidth);
				ctx.lineDashOffset = 0;
			} else {
				this.drawArrow(p1.x, p1.y, p2.x, p2.y, color, dash, lineWidth);
			}
			if (e.label && alpha > 0.5) {
				labels.push({
					x: (p1.x + p2.x) / 2,
					y: (p1.y + p2.y) / 2,
					text: e.label,
					alpha,
				});
			}
		}
		ctx.globalAlpha = 1;

		ctx.font = `9px ${REPORT_FONT_STACK}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (const l of labels) {
			const w = ctx.measureText(l.text).width + 8;
			ctx.globalAlpha = l.alpha;
			this.rect(l.x - w / 2, l.y - 7, w, 14);
			ctx.fillStyle = "#0f0f0f";
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.14)";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = "#9ca3af";
			ctx.fillText(l.text, l.x, l.y);
		}
		ctx.globalAlpha = 1;

		// White animated highlight for the hovered detail-panel row.
		let hoverPair: [MgNode, MgNode] | null = null;
		if (this.selected && this.hoverImport && this.nodeMap[this.hoverImport]) {
			hoverPair = [this.selected, this.nodeMap[this.hoverImport] as MgNode];
		} else if (
			this.selected &&
			this.hoverUsedBy &&
			this.nodeMap[this.hoverUsedBy]
		) {
			hoverPair = [this.nodeMap[this.hoverUsedBy] as MgNode, this.selected];
		}
		if (hoverPair) {
			const hp1 = this.boxPort(hoverPair[0], hoverPair[1].x, hoverPair[1].y);
			const hp2 = this.boxPort(hoverPair[1], hoverPair[0].x, hoverPair[0].y);
			ctx.lineDashOffset = -this.dashT;
			this.drawArrow(hp1.x, hp1.y, hp2.x, hp2.y, "#ffffff", [8, 6], 2.6);
			ctx.lineDashOffset = 0;
			ctx.globalAlpha = 1;
		}
	}

	private hoverAnimTick(): void {
		if (
			this.hoverImport === null &&
			this.hoverUsedBy === null &&
			!this.selected
		) {
			this.hoverAnimOn = false;
			return;
		}
		this.dashT = (this.dashT + 0.25) % 10_000;
		this.draw();
		requestAnimationFrame(() => this.hoverAnimTick());
	}

	private startHoverAnim(): void {
		if (!this.hoverAnimOn) {
			this.hoverAnimOn = true;
			requestAnimationFrame(() => this.hoverAnimTick());
		}
	}

	private drawNodes(): void {
		const ctx = this.ctx as CanvasRenderingContext2D;
		for (const n of this.nodes) {
			const alpha = this.nodeAlpha(n);
			if (alpha <= 0) {
				continue;
			}
			const isRoot = this.rootModules.has(n.name);
			const isCirc = this.circularModules.has(n.name);
			const isSel = this.selected === n;
			const x = n.x - n.w / 2;
			const y = n.y - n.h / 2;

			ctx.globalAlpha = alpha;

			if (n.isGlobal) {
				this.rect(x - 4, y - 4, n.w + 8, n.h + 8);
				ctx.strokeStyle = "rgba(251,191,36,0.35)";
				ctx.lineWidth = 2;
				ctx.setLineDash([]);
				ctx.stroke();
			}

			let fill = "#1a1a2e";
			let stroke = "#333";
			if (n.external) {
				fill = "#161616";
				stroke = "#4b5563";
			}
			if (isRoot) {
				fill = "#1a2e1a";
				stroke = "#2a5a2a";
			}
			if (n.isGlobal) {
				fill = "#2a2410";
				stroke = MG_GLOBAL;
			}
			if (isCirc) {
				fill = "#2e1a1a";
				stroke = MG_CYCLE;
			}
			if (isSel) {
				stroke = "#fff";
			}

			this.rect(x, y, n.w, n.h);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = stroke;
			ctx.lineWidth = isSel ? 2 : 1;
			ctx.setLineDash(n.external && !isSel ? [4, 3] : []);
			ctx.stroke();
			ctx.setLineDash([]);

			// The label sits at the top edge, one sub line per 12px below it.
			const top = n.y - n.h / 2;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = n.external ? "#9ca3af" : "#fff";
			ctx.font = `bold 12px ${REPORT_FONT_STACK}`;
			ctx.fillText(n.label || n.name, n.x, top + 14);
			ctx.fillStyle = "#888";
			ctx.font = `10px ${REPORT_FONT_STACK}`;
			(n.subLines ?? []).forEach((line, i) => {
				ctx.fillText(line, n.x, top + 29 + i * MG_SUB_LINE_H);
			});
		}
		ctx.globalAlpha = 1;
	}

	private draw(): void {
		const ctx = this.ctx;
		if (!ctx || this.w === 0) {
			return;
		}
		this.syncZoomUi();
		ctx.save();
		ctx.clearRect(0, 0, this.w, this.h);
		ctx.translate(this.w / 2, this.h / 2);
		ctx.scale(this.zoom, this.zoom);
		ctx.translate(-this.w / 2 + this.camX, -this.h / 2 + this.camY);
		this.drawClusters();
		this.drawGlobalReach();
		this.drawEdges();
		this.drawNodes();
		ctx.restore();
	}

	private hitTest(wx: number, wy: number): MgNode | null {
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i] as MgNode;
			if (this.hideExternal && n.external) {
				continue;
			}
			if (
				wx >= n.x - n.w / 2 &&
				wx <= n.x + n.w / 2 &&
				wy >= n.y - n.h / 2 &&
				wy <= n.y + n.h / 2
			) {
				return n;
			}
		}
		return null;
	}

	private showTooltip(n: MgNode, sx: number, sy: number): void {
		const bits: string[] = [];
		if (n.project) {
			bits.push(n.project);
		}
		bits.push(`${n.providers.length} providers`);
		bits.push(`${n.controllers.length} controllers`);
		bits.push(`${n.imports.length} imports`);
		const timing = this.moduleTimings.get(n.name);
		if (timing) {
			bits.push(moduleTimingLabel(timing));
		}
		this.tooltipEl.innerHTML =
			`<div class="tt-name">${escapeHtml(displayName(n))}</div>` +
			`<div class="tt-table">${escapeHtml(bits.join(" · "))}</div>`;
		this.tooltipEl.style.display = "block";
		this.tooltipEl.style.left = `${Math.min(sx + 14, this.w - 240)}px`;
		this.tooltipEl.style.top = `${sy + 14}px`;
	}

	private hideTooltip(): void {
		this.tooltipEl.style.display = "none";
	}

	private on(
		target: HTMLElement | Window,
		type: string,
		handler: EventListener,
		options?: AddEventListenerOptions
	): void {
		target.addEventListener(type, handler, options);
		this.disposers.push(() =>
			target.removeEventListener(type, handler, options)
		);
	}

	private bindEvents(): void {
		this.on(this.canvas, "mousedown", ((e: MouseEvent) => {
			this.panning = true;
			this.panMoved = false;
			this.panStart = { x: e.clientX, y: e.clientY };
		}) as EventListener);

		this.on(this.canvas, "mousemove", ((e: MouseEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			if (this.panning) {
				const dx = e.clientX - this.panStart.x;
				const dy = e.clientY - this.panStart.y;
				if (Math.abs(dx) + Math.abs(dy) > 3) {
					this.panMoved = true;
				}
				this.camX += dx / this.zoom;
				this.camY += dy / this.zoom;
				this.panStart = { x: e.clientX, y: e.clientY };
				this.hideTooltip();
				this.scheduleRedraw();
				return;
			}
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const pos = this.screenToWorld(sx, sy);
			const hit = this.hitTest(pos.x, pos.y);
			if (hit !== this.hovered) {
				this.hovered = hit;
				if (hit) {
					this.showTooltip(hit, sx, sy);
				} else {
					this.hideTooltip();
				}
				this.canvas.style.cursor = hit ? "pointer" : "grab";
			} else if (hit) {
				this.showTooltip(hit, sx, sy);
			}
		}) as EventListener);

		this.on(window, "mouseup", () => {
			this.panning = false;
		});

		this.on(this.canvas, "click", ((e: MouseEvent) => {
			if (this.panMoved) {
				return;
			}
			const rect = this.canvas.getBoundingClientRect();
			const pos = this.screenToWorld(
				e.clientX - rect.left,
				e.clientY - rect.top
			);
			const hit = this.hitTest(pos.x, pos.y);
			if (hit) {
				this.callbacks.onSelect(hit.name);
			} else {
				this.clearSelection();
				this.callbacks.onSelect(null);
			}
		}) as EventListener);

		this.on(this.canvas, "mouseleave", () => {
			this.hovered = null;
			this.hideTooltip();
		});

		this.on(
			this.canvas,
			"wheel",
			((e: WheelEvent) => {
				e.preventDefault();
				// A pinch arrives as ctrl or meta and zooms; anything else pans.
				if (e.ctrlKey || e.metaKey) {
					const factor = e.deltaY > 0 ? 0.92 : 1.08;
					this.zoom = Math.max(
						Math.min(this.minZoom, 0.05),
						Math.min(5, this.zoom * factor)
					);
				} else {
					this.camX -= e.deltaX / this.zoom;
					this.camY -= e.deltaY / this.zoom;
				}
				this.hideTooltip();
				this.scheduleRedraw();
			}) as EventListener,
			{ passive: false }
		);
	}
}
