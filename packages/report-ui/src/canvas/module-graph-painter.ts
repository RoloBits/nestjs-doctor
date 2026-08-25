import { graphlib, layout } from "@dagrejs/dagre";
import type { ReportModel, SerializedModuleGraph } from "../model";

const MG_NODE_H = 40;
export const MG_EXTERNAL_PROJECT = "(external)";

const MG_INTRA_EDGE = "#444";
const MG_CROSS_EDGE = "#22d3ee";
const MG_CYCLE = "#ea2845";
const MG_GLOBAL = "#fbbf24";
const MG_SEL_OUT = "#60a5fa";
const MG_SEL_IN = "#34d399";
const RPT_FONT =
	'"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const PROJECT_COLORS = [
	"#3b82f6",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#14b8a6",
	"#f97316",
];

export interface MgNode {
	controllers: string[];
	dynamicImports: Record<string, string> | null;
	exports: string[];
	external?: boolean;
	filePath: string;
	h: number;
	imports: string[];
	initTimings: Array<{ initTime: number }> | null;
	isGlobal: boolean;
	label: string;
	line?: number;
	name: string;
	project: string;
	providers: string[];
	sub: string;
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

interface MgCluster {
	h: number;
	header: number;
	innerX: number;
	innerY: number;
	key: string;
	nodes: MgNode[];
	w: number;
	x: number;
	y: number;
}

/** Groups modules by owning project, keeping first-seen order. */
export function buildClusters(modules: MgNode[]): MgCluster[] {
	const order: MgCluster[] = [];
	const byKey = new Map<string, MgCluster>();
	for (const m of modules) {
		const key = m.project || "";
		let cluster = byKey.get(key);
		if (!cluster) {
			cluster = {
				key,
				nodes: [],
				x: 0,
				y: 0,
				w: 0,
				h: 0,
				innerX: 0,
				innerY: 0,
				header: 0,
			};
			byKey.set(key, cluster);
			order.push(cluster);
		}
		cluster.nodes.push(m);
	}
	return order;
}

/** Packs nodes into a compact grid; the fallback when dagre cannot run. */
function gridLayout(nodes: MgNode[], gutter: number) {
	const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
	let cellW = 0;
	let cellH = 0;
	for (const n of nodes) {
		if (n.w > cellW) {
			cellW = n.w;
		}
		if (n.h > cellH) {
			cellH = n.h;
		}
	}
	const rows = Math.ceil(nodes.length / cols);
	nodes.forEach((n, i) => {
		n.x = (i % cols) * (cellW + gutter) + cellW / 2;
		n.y = Math.floor(i / cols) * (cellH + gutter) + cellH / 2;
	});
	return {
		w: cols * cellW + (cols - 1) * gutter,
		h: rows * cellH + (rows - 1) * gutter,
	};
}

/** Ranks one cluster from its own origin with dagre. */
function layoutCluster(
	nodes: MgNode[],
	edges: Array<{ from: string; to: string }>
) {
	if (nodes.length === 1) {
		return gridLayout(nodes, 30);
	}

	const present = new Set(nodes.map((n) => n.name));
	const g = new graphlib.Graph();
	g.setGraph({
		rankdir: "TB",
		nodesep: 26,
		ranksep: 58,
		marginx: 0,
		marginy: 0,
	});
	g.setDefaultEdgeLabel(() => ({}));
	for (const n of nodes) {
		g.setNode(n.name, { width: n.w, height: n.h });
	}

	const seen = new Set<string>();
	for (const e of edges) {
		if (e.from === e.to) {
			continue;
		}
		if (!(present.has(e.from) && present.has(e.to))) {
			continue;
		}
		const key = `${e.from}->${e.to}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		g.setEdge(e.from, e.to);
	}

	layout(g);

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const n of nodes) {
		const laid = g.node(n.name) as { x: number; y: number } | undefined;
		if (!laid) {
			continue;
		}
		n.x = laid.x;
		n.y = laid.y;
		minX = Math.min(minX, laid.x - n.w / 2);
		maxX = Math.max(maxX, laid.x + n.w / 2);
		minY = Math.min(minY, laid.y - n.h / 2);
		maxY = Math.max(maxY, laid.y + n.h / 2);
	}
	if (minX === Number.POSITIVE_INFINITY) {
		return gridLayout(nodes, 30);
	}
	for (const n of nodes) {
		n.x -= minX;
		n.y -= minY;
	}
	return { w: maxX - minX, h: maxY - minY };
}

/** Shelf-packs cluster boxes into a roughly square area. */
function packBoxes(
	boxes: Array<{ w: number; h: number; x: number; y: number }>,
	targetW: number,
	gutter: number
): void {
	let x = 0;
	let y = 0;
	let shelfH = 0;
	for (const box of boxes) {
		if (x > 0 && x + box.w > targetW) {
			x = 0;
			y += shelfH + gutter;
			shelfH = 0;
		}
		box.x = x;
		box.y = y;
		x += box.w + gutter;
		if (box.h > shelfH) {
			shelfH = box.h;
		}
	}
}

/** Lays modules inside project containers, then packs the containers. */
export function computeLayout(
	modules: MgNode[],
	edges: Array<{ from: string; to: string }>
): MgCluster[] {
	const GUTTER = 64;
	const PAD = 20;
	const HEADER = 26;
	const clusters = buildClusters(modules);

	for (const c of clusters) {
		const header = c.key ? HEADER : 0;
		const size = layoutCluster(c.nodes, edges);
		c.innerX = PAD;
		c.innerY = PAD + header;
		c.header = header;
		c.w = size.w + PAD * 2;
		c.h = size.h + PAD * 2 + header;
	}

	clusters.sort((a, b) => b.h - a.h || b.w - a.w);

	let area = 0;
	for (const c of clusters) {
		area += c.w * c.h;
	}
	const targetW = Math.max(1000, Math.sqrt(area) * 1.7);
	packBoxes(clusters, targetW, GUTTER);

	for (const box of clusters) {
		for (const n of box.nodes) {
			n.x += box.x + box.innerX;
			n.y += box.y + box.innerY;
		}
	}
	return clusters;
}

/** Maps each module to the modules that import it. */
export function reverseIndex(
	edges: Array<{ from: string; to: string }>
): Record<string, string[]> {
	const idx: Record<string, string[]> = {};
	for (const e of edges) {
		idx[e.to] ??= [];
		if (!idx[e.to].includes(e.from)) {
			idx[e.to].push(e.from);
		}
	}
	return idx;
}

/** Every module that transitively imports this one, counted per project. */
export function blastRadius(
	name: string,
	index: Record<string, string[]>,
	projectOf: (n: string) => string
): {
	names: string[];
	byProject: Record<string, number>;
	projectCount: number;
} {
	const seen: Record<string, boolean> = { [name]: true };
	const queue = [name];
	const names: string[] = [];
	const byProject: Record<string, number> = {};
	let projectCount = 0;
	while (queue.length > 0) {
		const cur = queue.shift() as string;
		for (const src of index[cur] ?? []) {
			if (seen[src]) {
				continue;
			}
			seen[src] = true;
			names.push(src);
			queue.push(src);
			const p = projectOf(src) || "";
			if (byProject[p] === undefined) {
				byProject[p] = 0;
				projectCount++;
			}
			byProject[p]++;
		}
	}
	names.sort();
	return { names, byProject, projectCount };
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

interface PainterOptions {
	onSelect?: (node: MgNode | null) => void;
	onZoomChange?: (pct: number) => void;
}

/**
 * Owns the canvas module graph: layout state, camera, and drawing.
 * Interactions stay imperative; React only mounts the canvas element.
 */
export class ModuleGraphPainter {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly dead: boolean;
	private readonly canvas: HTMLCanvasElement;
	private readonly opts: PainterOptions;

	w = 0;
	h = 0;
	private readonly dpr =
		typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

	nodes: MgNode[] = [];
	nodeMap = new Map<string, MgNode>();
	clusters: MgCluster[] = [];
	edges: MgEdge[] = [];
	importers: Record<string, string[]> = {};
	globalNames: string[] = [];

	camX = 0;
	camY = 0;
	zoom = 1;
	minZoom = 0.2;

	selected: MgNode | null = null;
	matches: Record<string, boolean> | null = null;
	showGlobals = false;
	hideExternal = true;
	activeProject = "all";

	private dirty = false;
	private flightToken = 0;
	private lastZoomUi: number | null = null;

	constructor(canvas: HTMLCanvasElement, opts: PainterOptions = {}) {
		this.canvas = canvas;
		// jsdom and headless environments return null; the painter then only
		// computes layout so tests can assert on it. All ctx access sits
		// behind draw()/resize() guards via `dead`.
		const raw = canvas.getContext("2d");
		this.dead = !raw;
		this.ctx = raw as CanvasRenderingContext2D;
		this.opts = opts;
	}

	setModel(model: ReportModel): void {
		this.build(model.graph);
		this.centerCamera();
		this.scheduleRedraw();
	}

	/** Strips the monorepo project prefix, matching the legacy display name. */
	static displayName(n: { name: string; project?: string }): string {
		return n.project && n.name.startsWith(`${n.project}/`)
			? n.name.slice(n.project.length + 1)
			: n.name;
	}

	private measure(n: MgNode): void {
		const label = ModuleGraphPainter.displayName(n);
		let sub = `${n.providers.length}p \u00b7 ${n.controllers.length}c`;
		if (n.initTimings && n.initTimings.length > 0) {
			sub += ` \u00b7 ${formatMs(n.initTimings[0].initTime)}`;
		}
		let lw = label.length * 7.2;
		let sw = sub.length * 6;
		if (this.ctx) {
			this.ctx.font = `bold 12px ${RPT_FONT}`;
			lw = this.ctx.measureText(label).width;
			this.ctx.font = `10px ${RPT_FONT}`;
			sw = this.ctx.measureText(sub).width;
		}
		n.label = label;
		n.sub = sub;
		n.w = Math.max(112, Math.max(lw, sw) + 28);
		n.h = MG_NODE_H;
	}

	private build(graph: SerializedModuleGraph): void {
		this.nodes = [];
		this.nodeMap = new Map();
		this.globalNames = [];

		const circularEdges = new Set<string>();
		for (const cycle of graph.circularDeps ?? []) {
			for (let i = 0; i < cycle.length; i++) {
				circularEdges.add(`${cycle[i]}->${cycle[(i + 1) % cycle.length]}`);
			}
		}

		for (const m of graph.modules) {
			const n: MgNode = {
				name: m.name,
				project: m.project || "",
				filePath: m.filePath,
				isGlobal: !!m.isGlobal,
				imports: m.imports ?? [],
				exports: m.exports ?? [],
				providers: m.providers ?? [],
				controllers: m.controllers ?? [],
				dynamicImports: m.dynamicImports ?? null,
				initTimings:
					(m.initTimings as Array<{ initTime: number }> | undefined) ?? null,
				x: 0,
				y: 0,
				w: 0,
				h: MG_NODE_H,
				label: "",
				sub: "",
			};
			this.measure(n);
			this.nodes.push(n);
			this.nodeMap.set(n.name, n);
			if (n.isGlobal) {
				this.globalNames.push(n.name);
			}
		}

		const declaredCount = this.nodes.length;
		const extEdges: Array<{ from: string; to: string }> = [];
		for (let i = 0; i < declaredCount; i++) {
			const src = this.nodes[i];
			for (const targetName of src.imports) {
				let target = this.nodeMap.get(targetName);
				if (!target) {
					const xn: MgNode = {
						name: targetName,
						project: MG_EXTERNAL_PROJECT,
						filePath: "",
						isGlobal: false,
						imports: [],
						exports: [],
						providers: [],
						controllers: [],
						dynamicImports: null,
						initTimings: null,
						external: true,
						x: 0,
						y: 0,
						w: 0,
						h: MG_NODE_H,
						label: "",
						sub: "package",
					};
					this.measure(xn);
					this.nodes.push(xn);
					this.nodeMap.set(targetName, xn);
					target = xn;
				}
				if (target.external) {
					extEdges.push({ from: src.name, to: targetName });
				}
			}
		}

		this.edges = [];
		const allEdges = [...graph.edges, ...extEdges];
		for (const e of allEdges) {
			const a = this.nodeMap.get(e.from);
			const b = this.nodeMap.get(e.to);
			if (!(a && b)) {
				continue;
			}
			this.edges.push({
				from: e.from,
				to: e.to,
				ext: !!(a.external || b.external),
				cross: !(a.external || b.external) && a.project !== b.project,
				cycle: circularEdges.has(`${e.from}->${e.to}`),
				label: a.dynamicImports?.[e.to] || null,
			});
		}

		this.importers = reverseIndex(allEdges);
		this.clusters = computeLayout(this.nodes, this.edges);
	}

	resize(w: number, h: number): void {
		if (this.dead || w === 0 || h === 0) {
			return;
		}
		if (w === this.w && h === this.h) {
			this.scheduleRedraw();
			return;
		}
		this.w = w;
		this.h = h;
		this.canvas.width = w * this.dpr;
		this.canvas.height = h * this.dpr;
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		this.scheduleRedraw();
	}

	centerCamera(): void {
		if (this.nodes.length === 0 || this.w === 0) {
			return;
		}
		const visible = this.nodes.filter(
			(n) => !(this.hideExternal && n.external)
		);
		const b = bounds(visible.length ? visible : this.nodes);
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
		this.syncZoomUi();
		this.scheduleRedraw();
	}

	screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: (sx - this.w / 2) / this.zoom + this.w / 2 - this.camX,
			y: (sy - this.h / 2) / this.zoom + this.h / 2 - this.camY,
		};
	}

	panTo(n: MgNode): void {
		this.camX = this.w / 2 - n.x;
		this.camY = this.h / 2 - n.y;
		this.scheduleRedraw();
	}

	flyTo(targetCamX: number, targetCamY: number, targetZoom: number): void {
		const token = ++this.flightToken;
		const step = (): void => {
			if (token !== this.flightToken) {
				return;
			}
			this.camX = targetCamX;
			this.camY = targetCamY;
			this.zoom = targetZoom;
			this.draw();
		};
		if (
			typeof document !== "undefined" &&
			document.visibilityState === "hidden"
		) {
			step();
			return;
		}
		const fromX = this.camX;
		const fromY = this.camY;
		const fromZ = this.zoom;
		const start: number | null = null;
		const DURATION = 280;
		let t0: number | null = start;
		const anim = (ts: number): void => {
			if (token !== this.flightToken) {
				return;
			}
			if (t0 === null) {
				t0 = ts;
			}
			const t = Math.min(1, (ts - t0) / DURATION);
			const ease = t * (2 - t);
			this.camX = fromX + (targetCamX - fromX) * ease;
			this.camY = fromY + (targetCamY - fromY) * ease;
			this.zoom = fromZ + (targetZoom - fromZ) * ease;
			this.draw();
			if (t < 1) {
				requestAnimationFrame(anim);
			}
		};
		requestAnimationFrame(anim);
	}

	flyToNode(n: MgNode): void {
		const zoom = Math.min(1.2, Math.max(this.zoom, 0.85));
		this.flyTo(this.w / 2 - n.x, this.h / 2 - n.y, zoom);
	}

	fitNodes(names: string[]): void {
		const nodes = names
			.map((name) => this.nodeMap.get(name))
			.filter((n): n is MgNode => !!n);
		if (nodes.length === 0) {
			return;
		}
		const b = bounds(nodes);
		const gw = b.maxX - b.minX + 160;
		const gh = b.maxY - b.minY + 160;
		const zoom = Math.min(1.2, Math.min(this.w / gw, this.h / gh));
		this.flyTo(
			this.w / 2 - (b.minX + b.maxX) / 2,
			this.h / 2 - (b.minY + b.maxY) / 2,
			Math.max(this.minZoom, zoom)
		);
	}

	select(node: MgNode | null): void {
		this.selected = node;
		this.opts.onSelect?.(node);
		this.scheduleRedraw();
	}

	focus(name: string): void {
		const n = this.nodeMap.get(name);
		if (!n) {
			return;
		}
		this.select(n);
		this.flyToNode(n);
	}

	applySearch(raw: string): void {
		const q = raw.trim().toLowerCase();
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
				if (!first) {
					first = n;
				}
			}
		}
		if (first) {
			this.panTo(first);
		}
		this.scheduleRedraw();
	}

	hitTest(wx: number, wy: number): MgNode | null {
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i];
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

	scheduleRedraw(): void {
		if (this.dirty) {
			return;
		}
		this.dirty = true;
		requestAnimationFrame(() => {
			this.dirty = false;
			this.draw();
		});
	}

	zoomBy(factor: number): void {
		this.zoom = Math.min(4, Math.max(this.minZoom, this.zoom * factor));
		this.syncZoomUi();
		this.scheduleRedraw();
	}

	private syncZoomUi(): void {
		const pct = Math.round(this.zoom * 100);
		if (pct === this.lastZoomUi) {
			return;
		}
		this.lastZoomUi = pct;
		this.opts.onZoomChange?.(pct);
	}

	private nodeAlpha(n: MgNode): number {
		if (this.hideExternal && n.external) {
			return 0;
		}
		let a = 1;
		if (this.activeProject !== "all" && n.project !== this.activeProject) {
			a = 0.16;
		}
		if (this.matches && !this.matches[n.name]) {
			a = Math.min(a, 0.1);
		}
		return a;
	}

	private edgeAlpha(e: MgEdge): number {
		const a = this.nodeMap.get(e.from);
		const b = this.nodeMap.get(e.to);
		if (!(a && b)) {
			return 0;
		}
		if (this.hideExternal && e.ext) {
			return 0;
		}
		if (this.selected) {
			return e.from === this.selected.name || e.to === this.selected.name
				? 1
				: 0.05;
		}
		const aa = this.nodeAlpha(a);
		const ba = this.nodeAlpha(b);
		let base: number;
		if (aa === ba) {
			base = aa;
		} else if (Math.max(aa, ba) === 1) {
			base = 0.55;
		} else {
			base = Math.min(aa, ba);
		}
		return e.cross ? base * 0.42 : base;
	}

	private clusterAlpha(c: MgCluster): number {
		if (this.activeProject !== "all" && c.key !== this.activeProject) {
			return 0.28;
		}
		return 1;
	}

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
		const ctx = this.ctx;
		const angle = Math.atan2(toY - fromY, toX - fromX);
		ctx.beginPath();
		ctx.setLineDash(dash);
		ctx.moveTo(fromX, fromY);
		ctx.lineTo(toX, toY);
		ctx.strokeStyle = color;
		ctx.lineWidth = width || 1.4;
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
		for (const c of this.clusters) {
			if (this.hideExternal && c.key === MG_EXTERNAL_PROJECT) {
				continue;
			}
			const color = c.key ? "#555" : "#555";
			this.ctx.globalAlpha = this.clusterAlpha(c) * 0.5;
			this.ctx.beginPath();
			this.ctx.rect(c.x, c.y, c.w, c.h);
			this.ctx.fillStyle = "rgba(255,255,255,0.022)";
			this.ctx.fill();
			this.ctx.strokeStyle = color;
			this.ctx.lineWidth = 1;
			this.ctx.setLineDash([]);
			this.ctx.stroke();
			if (c.key) {
				this.ctx.globalAlpha = this.clusterAlpha(c);
				this.ctx.fillStyle = color;
				this.ctx.font = `bold 12px ${RPT_FONT}`;
				this.ctx.textAlign = "left";
				this.ctx.textBaseline = "middle";
				this.ctx.fillText(c.key, c.x + 12, c.y + 15);
				this.ctx.fillStyle = "#666";
				this.ctx.font = `10px ${RPT_FONT}`;
				this.ctx.fillText(
					`${c.nodes.length}${c.nodes.length === 1 ? " module" : " modules"}`,
					c.x + 16 + this.ctx.measureText(c.key).width * 1.15,
					c.y + 15
				);
			}
		}
		this.ctx.globalAlpha = 1;
	}

	private drawGlobalReach(): void {
		if (!this.showGlobals || this.globalNames.length === 0) {
			return;
		}
		for (const name of this.globalNames) {
			const src = this.nodeMap.get(name);
			if (!src) {
				continue;
			}
			this.ctx.globalAlpha = 0.9;
			this.ctx.beginPath();
			this.ctx.rect(
				src.x - src.w / 2 - 5,
				src.y - src.h / 2 - 5,
				src.w + 10,
				src.h + 10
			);
			this.ctx.strokeStyle = MG_GLOBAL;
			this.ctx.lineWidth = 2;
			this.ctx.stroke();
			this.ctx.globalAlpha = 0.45;
			for (const dst of this.nodes) {
				if (dst === src || dst.imports.includes(src.name)) {
					continue;
				}
				const p1 = this.boxPort(src, dst.x, dst.y);
				const p2 = this.boxPort(dst, src.x, src.y);
				this.ctx.beginPath();
				this.ctx.setLineDash([2, 4]);
				this.ctx.moveTo(p1.x, p1.y);
				this.ctx.lineTo(p2.x, p2.y);
				this.ctx.strokeStyle = MG_GLOBAL;
				this.ctx.lineWidth = 1.5;
				this.ctx.stroke();
				this.ctx.setLineDash([]);
			}
		}
		this.ctx.globalAlpha = 1;
	}

	private drawEdges(): void {
		const labels: Array<{ x: number; y: number; text: string; alpha: number }> =
			[];
		for (const e of this.edges) {
			let alpha = this.edgeAlpha(e);
			if (alpha <= 0) {
				continue;
			}
			const a = this.nodeMap.get(e.from) as MgNode;
			const b = this.nodeMap.get(e.to) as MgNode;
			const p1 = this.boxPort(a, b.x, b.y);
			const p2 = this.boxPort(b, a.x, a.y);
			let color: string = MG_INTRA_EDGE;
			if (e.cycle) {
				color = MG_CYCLE;
			} else if (e.cross) {
				color = MG_CROSS_EDGE;
			}
			let dash: number[] = [];
			if (e.cycle) {
				dash = [5, 4];
			} else if (e.cross) {
				dash = [7, 5];
			}
			if (e.ext && !e.cycle) {
				color = "#6b7280";
				dash = [3, 4];
			}
			let lineWidth = e.cross || e.cycle ? 1.6 : 1.3;
			if (this.selected && !e.cycle) {
				if (e.from === this.selected.name) {
					color = MG_SEL_OUT;
					lineWidth = 2.2;
					dash = [9, 6];
					alpha = Math.max(alpha, 0.95);
				} else if (e.to === this.selected.name) {
					color = MG_SEL_IN;
					lineWidth = 2.2;
					dash = [9, 6];
					alpha = Math.max(alpha, 0.95);
				}
			}
			this.ctx.globalAlpha = alpha;
			this.drawArrow(p1.x, p1.y, p2.x, p2.y, color, dash, lineWidth);
			if (e.label && alpha > 0.5) {
				labels.push({
					x: (p1.x + p2.x) / 2,
					y: (p1.y + p2.y) / 2,
					text: e.label,
					alpha,
				});
			}
		}
		this.ctx.globalAlpha = 1;

		this.ctx.font = `9px ${RPT_FONT}`;
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		for (const l of labels) {
			const w = this.ctx.measureText(l.text).width + 8;
			this.ctx.globalAlpha = l.alpha;
			this.ctx.beginPath();
			this.ctx.rect(l.x - w / 2, l.y - 7, w, 14);
			this.ctx.fillStyle = "#0f0f0f";
			this.ctx.fill();
			this.ctx.strokeStyle = "rgba(255,255,255,0.14)";
			this.ctx.lineWidth = 1;
			this.ctx.stroke();
			this.ctx.fillStyle = "#9ca3af";
			this.ctx.fillText(l.text, l.x, l.y);
		}
		this.ctx.globalAlpha = 1;
	}

	private drawNodes(): void {
		const roots = rootModuleSet(this.nodes);
		for (const n of this.nodes) {
			const alpha = this.nodeAlpha(n);
			if (alpha <= 0) {
				continue;
			}
			const isSel = this.selected === n;
			const x = n.x - n.w / 2;
			const y = n.y - n.h / 2;
			const ctx = this.ctx;

			ctx.globalAlpha = alpha;

			if (n.isGlobal) {
				ctx.beginPath();
				ctx.rect(x - 4, y - 4, n.w + 8, n.h + 8);
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
			if (roots.has(n.name)) {
				fill = "#1a2e1a";
				stroke = "#2a5a2a";
			}
			if (n.isGlobal) {
				fill = "#2a2410";
				stroke = MG_GLOBAL;
			}
			if (isSel) {
				stroke = "#fff";
			}

			ctx.beginPath();
			ctx.rect(x, y, n.w, n.h);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = stroke;
			ctx.lineWidth = isSel ? 2 : 1;
			ctx.setLineDash(n.external && !isSel ? [4, 3] : []);
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = n.external ? "#9ca3af" : "#fff";
			ctx.font = `bold 12px ${RPT_FONT}`;
			ctx.fillText(n.label, n.x, n.y - 6);
			ctx.fillStyle = "#888";
			ctx.font = `10px ${RPT_FONT}`;
			ctx.fillText(n.sub, n.x, n.y + 9);
		}
		this.ctx.globalAlpha = 1;
	}

	draw(): void {
		if (this.dead || this.w === 0) {
			return;
		}
		const ctx = this.ctx;
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
}

function rootModuleSet(nodes: MgNode[]): Set<string> {
	const importedBy = new Set<string>();
	for (const n of nodes) {
		for (const target of n.imports) {
			importedBy.add(target);
		}
	}
	const roots = new Set<string>();
	for (const n of nodes) {
		if (!importedBy.has(n.name)) {
			roots.add(n.name);
		}
	}
	return roots;
}

function bounds(nodes: MgNode[]): {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
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
