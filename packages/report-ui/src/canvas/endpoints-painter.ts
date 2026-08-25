import { graphlib, layout } from "@dagrejs/dagre";
import type {
	EndpointNodePayload,
	MethodDependencyNode,
	ReportModel,
} from "../model";

const RPT_FONT =
	'"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const EP_TYPE_COLORS: Record<string, string> = {
	controller: "#ea2845",
	service: "#3b82f6",
	repository: "#10b981",
	guard: "#f59e0b",
	interceptor: "#8b5cf6",
	pipe: "#14b8a6",
	filter: "#ef4444",
	gateway: "#ec4899",
	step: "#64748b",
	throw: "#f87171",
	unknown: "#666",
};

export interface EpNode {
	className: string;
	conditional: boolean;
	filePath: string;
	h: number;
	id: number;
	line?: number;
	methodName: string;
	order: number;
	type: string;
	w: number;
	x: number;
	y: number;
}

interface EpEdge {
	conditional: boolean;
	from: number;
	to: number;
}

/** Flattens one endpoint's call tree into canvas nodes and edges. */
export function buildEndpointGraph(ep: EndpointNodePayload): {
	nodes: EpNode[];
	edges: EpEdge[];
} {
	const nodes: EpNode[] = [];
	const edges: EpEdge[] = [];
	let id = 0;

	const root: EpNode = {
		id: id++,
		className: ep.controllerClass,
		conditional: false,
		filePath: ep.filePath,
		line: ep.line,
		methodName: ep.handlerMethod,
		order: -1,
		type: "controller",
		x: 0,
		y: 0,
		w: 180,
		h: 60,
	};
	nodes.push(root);

	const walk = (parent: EpNode, deps: MethodDependencyNode[]): void => {
		for (const dep of deps) {
			const n: EpNode = {
				id: id++,
				className: dep.className,
				conditional: !!dep.conditional,
				filePath: dep.filePath ?? "",
				line: dep.line,
				methodName: dep.methodName,
				order: dep.order ?? 0,
				type: dep.type,
				x: 0,
				y: 0,
				w: 180,
				h: 60,
			};
			nodes.push(n);
			edges.push({
				from: parent.id,
				to: n.id,
				conditional: !!dep.conditional,
			});
			if (dep.dependencies?.length) {
				walk(n, dep.dependencies);
			}
		}
	};

	walk(root, ep.dependencies);
	return { nodes, edges };
}

function layoutNodes(nodes: EpNode[], edges: EpEdge[]): void {
	if (nodes.length === 0) {
		return;
	}
	const g = new graphlib.Graph();
	g.setGraph({
		rankdir: "TB",
		nodesep: 40,
		ranksep: 80,
		marginx: 40,
		marginy: 40,
	});
	g.setDefaultEdgeLabel(() => ({}));
	for (const n of nodes) {
		g.setNode(String(n.id), { width: n.w, height: n.h });
	}
	for (const e of edges) {
		g.setEdge(String(e.from), String(e.to));
	}
	layout(g);
	for (const n of nodes) {
		const laid = g.node(String(n.id)) as { x: number; y: number } | undefined;
		if (laid) {
			n.x = laid.x;
			n.y = laid.y;
		}
	}
}

/**
 * Owns the endpoints canvas for the currently selected endpoint.
 * Without a 2d context only layout computes; drawing is skipped.
 */
export class EndpointsPainter {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly dead: boolean;
	private readonly canvas: HTMLCanvasElement;

	w = 0;
	h = 0;
	camX = 0;
	camY = 0;
	zoom = 1;
	minZoom = 0.3;
	endpoint: EndpointNodePayload | null = null;
	nodes: EpNode[] = [];
	edges: EpEdge[] = [];

	private dirty = false;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const raw = canvas.getContext("2d");
		this.dead = !raw;
		this.ctx = raw as CanvasRenderingContext2D;
	}

	select(ep: EndpointNodePayload | null): void {
		this.endpoint = ep;
		if (!ep) {
			this.nodes = [];
			this.edges = [];
			this.scheduleRedraw();
			return;
		}
		const built = buildEndpointGraph(ep);
		this.nodes = built.nodes;
		this.edges = built.edges;
		layoutNodes(this.nodes, this.edges);
		this.centerCamera();
		this.scheduleRedraw();
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
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = w * dpr;
		this.canvas.height = h * dpr;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.scheduleRedraw();
	}

	centerCamera(): void {
		if (this.nodes.length === 0 || this.w === 0) {
			return;
		}
		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const n of this.nodes) {
			minX = Math.min(minX, n.x - n.w / 2);
			maxX = Math.max(maxX, n.x + n.w / 2);
			minY = Math.min(minY, n.y - n.h / 2);
			maxY = Math.max(maxY, n.y + n.h / 2);
		}
		const pad = 60;
		this.zoom = Math.max(
			0.3,
			Math.min(
				(this.w - pad * 2) / (maxX - minX || 1),
				(this.h - pad * 2) / (maxY - minY || 1),
				1.5
			)
		);
		this.camX = this.w / 2 - (minX + maxX) / 2;
		this.camY = this.h / 2 - (minY + maxY) / 2;
		this.scheduleRedraw();
	}

	zoomBy(factor: number): void {
		this.zoom = Math.min(4, Math.max(this.minZoom, this.zoom * factor));
		this.scheduleRedraw();
	}

	screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: (sx - this.w / 2) / this.zoom + this.w / 2 - this.camX,
			y: (sy - this.h / 2) / this.zoom + this.h / 2 - this.camY,
		};
	}

	hitTest(wx: number, wy: number): EpNode | null {
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i];
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

	draw(): void {
		if (this.dead || this.w === 0) {
			return;
		}
		const ctx = this.ctx;
		ctx.save();
		ctx.clearRect(0, 0, this.w, this.h);
		if (this.nodes.length === 0) {
			ctx.restore();
			return;
		}
		ctx.translate(this.w / 2, this.h / 2);
		ctx.scale(this.zoom, this.zoom);
		ctx.translate(-this.w / 2 + this.camX, -this.h / 2 + this.camY);

		const byId = new Map(this.nodes.map((n) => [n.id, n]));
		for (const e of this.edges) {
			const from = byId.get(e.from);
			const to = byId.get(e.to);
			if (!(from && to)) {
				continue;
			}
			const fx = from.x;
			const fy = from.y + from.h / 2;
			const tx = to.x;
			const ty = to.y - to.h / 2;
			const color = e.conditional ? "rgba(245,158,11,0.6)" : "#555";
			if (e.conditional) {
				ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
			}
			ctx.beginPath();
			ctx.moveTo(fx, fy);
			if (Math.abs(fx - tx) > 2) {
				const midY = fy + (ty - fy) / 2;
				ctx.lineTo(fx, midY);
				ctx.lineTo(tx, midY);
			}
			ctx.lineTo(tx, ty);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.5 / this.zoom;
			ctx.stroke();
			const arrow = 5 / this.zoom;
			ctx.beginPath();
			ctx.moveTo(tx - arrow, ty - arrow);
			ctx.lineTo(tx, ty);
			ctx.lineTo(tx + arrow, ty - arrow);
			ctx.strokeStyle = color;
			ctx.stroke();
			ctx.setLineDash([]);
		}

		const BOX_R = 6;
		const HDR_H = 22;
		for (const n of this.nodes) {
			const x = n.x - n.w / 2;
			const y = n.y - n.h / 2;
			const headerColor = n.conditional
				? "#f59e0b"
				: (EP_TYPE_COLORS[n.type] ?? EP_TYPE_COLORS.unknown);

			ctx.beginPath();
			ctx.roundRect(x, y, n.w, n.h, BOX_R);
			ctx.fillStyle = "#151515";
			ctx.fill();
			if (n.conditional) {
				ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
				ctx.strokeStyle = "rgba(245,158,11,0.5)";
			} else {
				ctx.strokeStyle = "rgba(255,255,255,0.06)";
			}
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y, n.w, HDR_H);
			ctx.clip();
			ctx.fillStyle = headerColor;
			ctx.globalAlpha = n.conditional ? 0.12 : 0.15;
			ctx.fillRect(x, y, n.w, HDR_H);
			ctx.globalAlpha = 1;
			ctx.restore();

			ctx.beginPath();
			ctx.moveTo(x + 1, y + HDR_H);
			ctx.lineTo(x + n.w - 1, y + HDR_H);
			ctx.strokeStyle = "rgba(255,255,255,0.06)";
			ctx.stroke();

			ctx.fillStyle = headerColor;
			ctx.fillRect(x + 8, y + HDR_H / 2 - 3, 6, 6);

			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#e0e0e0";
			ctx.font = `bold 11px ${RPT_FONT}`;
			ctx.fillText(n.className.slice(0, 20), x + 20, y + HDR_H / 2);
			ctx.fillStyle = "#9ca3af";
			ctx.font = `10px ${RPT_FONT}`;
			ctx.fillText(n.methodName, x + 10, y + HDR_H + (n.h - HDR_H) / 2);
		}
		ctx.restore();
	}
}

export function groupEndpoints(
	endpoints: EndpointNodePayload[]
): Array<{ controller: string; endpoints: EndpointNodePayload[] }> {
	const map = new Map<string, EndpointNodePayload[]>();
	for (const ep of endpoints) {
		const list = map.get(ep.controllerClass) ?? [];
		list.push(ep);
		map.set(ep.controllerClass, list);
	}
	return [...map.entries()]
		.map(([controller, eps]) => ({
			controller,
			endpoints: eps.sort((a, b) => a.routePath.localeCompare(b.routePath)),
		}))
		.sort((a, b) => a.controller.localeCompare(b.controller));
}

export function handlerSource(
	model: ReportModel,
	ep: EndpointNodePayload
): string | null {
	const source = model.fileSources[ep.filePath];
	if (!source) {
		return null;
	}
	const lines = source.split("\n");
	const start = Math.max(0, ep.line - 1);
	const end = Math.min(lines.length, ep.endLine ?? ep.line);
	return lines.slice(start, end).join("\n");
}
