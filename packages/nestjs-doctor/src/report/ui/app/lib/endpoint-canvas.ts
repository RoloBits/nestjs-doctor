import {
	buildEndpointGraph,
	layoutEndpointGraph,
} from "../../browser/endpoint-layout.js";
import { escapeHtml } from "../../browser/escape.js";
import { REPORT_FONT_STACK } from "../../font.js";

type Built = ReturnType<typeof buildEndpointGraph>;
type EpNode = Built["nodes"][number];
type EpEdge = Built["edges"][number];
type EpInput = Parameters<typeof buildEndpointGraph>[0];

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

const BOX_R = 6;
const HDR_H = 22;

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

// The imperative half of the Endpoints tab: camera, hit testing, tooltip
// and canvas painting. React owns everything around the canvas.
export class EndpointCanvas {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D | null;
	private readonly tooltipEl: HTMLElement;
	private readonly onNodeClick: (node: EpNode) => void;
	private readonly dpr: number;
	private w = 0;
	private h = 0;
	private camX = 0;
	private camY = 0;
	private zoom = 1;
	private dragging: EpNode | null = null;
	private panning = false;
	private panStart = { x: 0, y: 0 };
	private dragMoved = false;
	private hoveredNode: EpNode | null = null;
	private nodes: EpNode[] = [];
	private edges: EpEdge[] = [];
	private dirty = false;
	private readonly disposers: (() => void)[] = [];

	constructor(options: {
		canvas: HTMLCanvasElement;
		onNodeClick: (node: EpNode) => void;
		tooltipEl: HTMLElement;
	}) {
		this.canvas = options.canvas;
		this.tooltipEl = options.tooltipEl;
		this.onNodeClick = options.onNodeClick;
		this.ctx = this.canvas.getContext("2d");
		this.dpr = window.devicePixelRatio || 1;
		this.bindEvents();
	}

	setGraph(endpoint: EpInput): void {
		const built = buildEndpointGraph(endpoint);
		this.nodes = built.nodes;
		this.edges = built.edges;
		const dagre = (globalThis as { dagre?: unknown }).dagre;
		layoutEndpointGraph(
			this.nodes,
			this.edges,
			dagre as Parameters<typeof layoutEndpointGraph>[2]
		);
		this.resize();
	}

	resize(): void {
		if (!this.ctx) {
			return;
		}
		const container = this.canvas.parentElement;
		if (!container) {
			return;
		}
		this.w = container.clientWidth;
		this.h = container.clientHeight;
		this.canvas.width = this.w * this.dpr;
		this.canvas.height = this.h * this.dpr;
		this.canvas.style.width = `${this.w}px`;
		this.canvas.style.height = `${this.h}px`;
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		if (this.nodes.length > 0) {
			this.centerCamera();
		}
		this.scheduleRedraw();
	}

	recenter(): void {
		this.centerCamera();
		this.scheduleRedraw();
	}

	destroy(): void {
		for (const dispose of this.disposers) {
			dispose();
		}
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

	private screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: (sx - this.w / 2) / this.zoom + this.w / 2 - this.camX,
			y: (sy - this.h / 2) / this.zoom + this.h / 2 - this.camY,
		};
	}

	private hitTest(wx: number, wy: number): EpNode | null {
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i] as EpNode;
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

	private centerCamera(): void {
		if (this.nodes.length === 0) {
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
		const graphW = maxX - minX;
		const graphH = maxY - minY;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		const pad = 60;
		const scaleX = (this.w - pad * 2) / (graphW || 1);
		const scaleY = (this.h - pad * 2) / (graphH || 1);
		this.zoom = Math.min(scaleX, scaleY, 1.5);
		this.zoom = Math.max(this.zoom, 0.3);
		this.camX = this.w / 2 - cx;
		this.camY = this.h / 2 - cy;
	}

	private showTooltip(node: EpNode, screenX: number, screenY: number): void {
		const color =
			EP_TYPE_COLORS[node.type] || (EP_TYPE_COLORS.unknown as string);
		let methodHtml = "";
		if (node.methodName) {
			const mColor = node.conditional ? "#f59e0b" : "#ccc";
			methodHtml = `<div style="font-family:monospace;font-size:11px;color:${mColor};margin-top:4px">.${escapeHtml(node.methodName)}()</div>`;
		}
		const condLabel = node.conditional
			? '<div style="font-size:9px;color:#f59e0b;margin-top:4px">Conditionally called</div>'
			: "";
		const repeatLabel = node.expandedElsewhere
			? '<div style="font-size:9px;color:#888;margin-top:4px">↱ Calls drawn at another call site</div>'
			: "";
		this.tooltipEl.innerHTML =
			`<div class="tt-name">${escapeHtml(node.className)}</div>` +
			`<div class="tt-table" style="color:${color}">${escapeHtml(node.type)}</div>` +
			methodHtml +
			condLabel +
			repeatLabel;
		this.tooltipEl.style.display = "block";
		const parent = this.canvas.parentElement;
		if (!parent) {
			return;
		}
		const mainRect = parent.getBoundingClientRect();
		this.tooltipEl.style.left = `${screenX + 16}px`;
		this.tooltipEl.style.top = `${screenY - 10}px`;
		requestAnimationFrame(() => {
			const ttRect = this.tooltipEl.getBoundingClientRect();
			if (ttRect.right > mainRect.right - 8) {
				this.tooltipEl.style.left = `${screenX - ttRect.width - 8}px`;
			}
			if (ttRect.bottom > mainRect.bottom - 8) {
				this.tooltipEl.style.top = `${screenY - ttRect.height - 8}px`;
			}
		});
	}

	private hideTooltip(): void {
		this.tooltipEl.style.display = "none";
	}

	private on<K extends keyof HTMLElementEventMap>(
		target: HTMLElement | Window | Document,
		type: string,
		handler: (e: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions
	): void {
		target.addEventListener(type, handler as EventListener, options);
		this.disposers.push(() =>
			target.removeEventListener(type, handler as EventListener, options)
		);
	}

	private bindEvents(): void {
		this.on<"mousedown">(this.canvas, "mousedown", (e) => {
			const rect = this.canvas.getBoundingClientRect();
			const pos = this.screenToWorld(
				e.clientX - rect.left,
				e.clientY - rect.top
			);
			const hit = this.hitTest(pos.x, pos.y);
			this.dragMoved = false;
			if (hit) {
				this.dragging = hit;
				this.hideTooltip();
			} else {
				this.panning = true;
				this.panStart = { x: e.clientX, y: e.clientY };
			}
		});

		this.on<"mousemove">(this.canvas, "mousemove", (e) => {
			const rect = this.canvas.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const pos = this.screenToWorld(sx, sy);
			if (this.dragging) {
				this.dragMoved = true;
				this.dragging.x = pos.x;
				this.dragging.y = pos.y;
				this.scheduleRedraw();
				this.hideTooltip();
			} else if (this.panning) {
				this.dragMoved = true;
				this.camX += (e.clientX - this.panStart.x) / this.zoom;
				this.camY += (e.clientY - this.panStart.y) / this.zoom;
				this.panStart = { x: e.clientX, y: e.clientY };
				this.scheduleRedraw();
				this.hideTooltip();
			} else {
				const hit = this.hitTest(pos.x, pos.y);
				if (hit !== this.hoveredNode) {
					this.hoveredNode = hit;
					this.scheduleRedraw();
					if (hit) {
						this.showTooltip(hit, sx, sy);
					} else {
						this.hideTooltip();
					}
				} else if (hit) {
					this.showTooltip(hit, sx, sy);
				}
			}
		});

		this.on<"mouseup">(this.canvas, "mouseup", () => {
			const clickedNode = this.dragging;
			if (!this.dragMoved && clickedNode) {
				this.onNodeClick(clickedNode);
			}
			this.dragging = null;
			this.panning = false;
		});

		this.on<"mouseleave">(this.canvas, "mouseleave", () => {
			this.dragging = null;
			this.panning = false;
			this.hoveredNode = null;
			this.hideTooltip();
			this.scheduleRedraw();
		});

		this.on<"wheel">(
			this.canvas,
			"wheel",
			(e) => {
				e.preventDefault();
				// ctrlKey or metaKey means a pinch, which zooms; anything else pans.
				if (!(e.ctrlKey || e.metaKey)) {
					this.camX -= e.deltaX / this.zoom;
					this.camY -= e.deltaY / this.zoom;
					this.hideTooltip();
					this.scheduleRedraw();
					return;
				}
				const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
				const newZoom = Math.max(0.2, Math.min(3, this.zoom * zoomFactor));
				const rect = this.canvas.getBoundingClientRect();
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;
				const wx = (mx - this.w / 2) / this.zoom + this.w / 2 - this.camX;
				const wy = (my - this.h / 2) / this.zoom + this.h / 2 - this.camY;
				this.zoom = newZoom;
				this.camX = this.w / 2 - wx + (mx - this.w / 2) / this.zoom;
				this.camY = this.h / 2 - wy + (my - this.h / 2) / this.zoom;
				this.hideTooltip();
				this.scheduleRedraw();
			},
			{ passive: false }
		);
	}

	private draw(): void {
		const ctx = this.ctx;
		if (!ctx) {
			return;
		}
		ctx.save();
		ctx.clearRect(0, 0, this.w, this.h);
		if (this.nodes.length === 0) {
			ctx.restore();
			return;
		}
		ctx.translate(this.w / 2, this.h / 2);
		ctx.scale(this.zoom, this.zoom);
		ctx.translate(-this.w / 2 + this.camX, -this.h / 2 + this.camY);

		const nodeById = new Map<number, EpNode>();
		for (const n of this.nodes) {
			nodeById.set(n.id, n);
		}

		for (const edge of this.edges) {
			const fromN = nodeById.get(edge.from);
			const toN = nodeById.get(edge.to);
			if (!(fromN && toN)) {
				continue;
			}
			const fx = fromN.x;
			const fy = fromN.y + fromN.h / 2;
			const tx = toN.x;
			const ty = toN.y - toN.h / 2;
			const edgeColor = edge.conditional ? "rgba(245, 158, 11, 0.6)" : "#555";
			if (edge.conditional) {
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
			ctx.strokeStyle = edgeColor;
			ctx.lineWidth = 1.5 / this.zoom;
			ctx.stroke();

			const arrowSize = 5 / this.zoom;
			ctx.beginPath();
			ctx.moveTo(tx - arrowSize, ty - arrowSize);
			ctx.lineTo(tx, ty);
			ctx.lineTo(tx + arrowSize, ty - arrowSize);
			ctx.strokeStyle = edgeColor;
			ctx.lineWidth = 1.5 / this.zoom;
			ctx.stroke();
			ctx.setLineDash([]);
		}

		for (const n of this.nodes) {
			const x = n.x - n.w / 2;
			const y = n.y - n.h / 2;
			const color =
				EP_TYPE_COLORS[n.type] || (EP_TYPE_COLORS.unknown as string);
			const isHovered = this.hoveredNode?.id === n.id;
			const isCond = n.conditional;
			const headerColor = isCond ? "#f59e0b" : color;

			if (isHovered) {
				ctx.save();
				ctx.shadowColor = "rgba(255,255,255,0.2)";
				ctx.shadowBlur = 10;
			}

			roundRect(ctx, x, y, n.w, n.h, BOX_R);
			ctx.fillStyle = "#151515";
			ctx.fill();
			if (isCond) {
				ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
				ctx.strokeStyle = isHovered ? "#f59e0b" : "rgba(245,158,11,0.5)";
			} else {
				ctx.strokeStyle = isHovered ? "#ffffff" : "rgba(255,255,255,0.06)";
			}
			ctx.lineWidth = isHovered ? 2 : 1;
			ctx.stroke();
			ctx.setLineDash([]);
			if (isHovered) {
				ctx.restore();
			}

			ctx.save();
			ctx.beginPath();
			ctx.moveTo(x + BOX_R, y);
			ctx.lineTo(x + n.w - BOX_R, y);
			ctx.quadraticCurveTo(x + n.w, y, x + n.w, y + BOX_R);
			ctx.lineTo(x + n.w, y + HDR_H);
			ctx.lineTo(x, y + HDR_H);
			ctx.lineTo(x, y + BOX_R);
			ctx.quadraticCurveTo(x, y, x + BOX_R, y);
			ctx.closePath();
			ctx.clip();
			ctx.fillStyle = headerColor;
			ctx.globalAlpha = isCond ? 0.12 : 0.15;
			ctx.fillRect(x, y, n.w, HDR_H);
			ctx.globalAlpha = 1;
			ctx.restore();

			ctx.beginPath();
			ctx.moveTo(x + 1, y + HDR_H);
			ctx.lineTo(x + n.w - 1, y + HDR_H);
			ctx.strokeStyle = "rgba(255,255,255,0.06)";
			ctx.lineWidth = 1;
			ctx.stroke();

			const dotSize = 6;
			ctx.fillStyle = headerColor;
			ctx.fillRect(x + 8, y + HDR_H / 2 - dotSize / 2, dotSize, dotSize);

			ctx.fillStyle = "#e0e0e0";
			ctx.font = `bold 11px ${REPORT_FONT_STACK}`;
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			let nameStr = n.className;
			const nameStartX = x + 8 + dotSize + 6;
			const maxNameW = n.w - (nameStartX - x) - 8;
			while (ctx.measureText(nameStr).width > maxNameW && nameStr.length > 3) {
				nameStr = nameStr.slice(0, -1);
			}
			if (nameStr !== n.className) {
				nameStr += "…";
			}
			ctx.fillText(nameStr, nameStartX, y + HDR_H / 2);

			const infoY = y + HDR_H + 8;
			ctx.font = `bold 9px ${REPORT_FONT_STACK}`;
			const typeLabel = n.type.toUpperCase();
			const badgeW = ctx.measureText(typeLabel).width + 10;
			roundRect(ctx, x + 8, infoY - 1, badgeW, 14, 3);
			ctx.fillStyle = color;
			ctx.globalAlpha = 0.15;
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.fillStyle = color;
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(typeLabel, x + 13, infoY + 6);

			const badgeRight = x + 8 + badgeW;
			if (n.order >= 0) {
				const orderLabel = `#${n.order + 1}`;
				ctx.font = `bold 8px ${REPORT_FONT_STACK}`;
				const orderW = ctx.measureText(orderLabel).width + 8;
				roundRect(ctx, badgeRight + 4, infoY, orderW, 12, 3);
				ctx.fillStyle = "rgba(255,255,255,0.08)";
				ctx.fill();
				ctx.fillStyle = "#999";
				ctx.textBaseline = "middle";
				ctx.fillText(orderLabel, badgeRight + 8, infoY + 6);
			}

			if (n.expandedElsewhere) {
				ctx.font = `bold 10px ${REPORT_FONT_STACK}`;
				ctx.fillStyle = "#888";
				ctx.textAlign = "right";
				ctx.textBaseline = "middle";
				ctx.fillText("↱", x + n.w - 8, infoY + 6);
				ctx.textAlign = "left";
			}

			if (n.methodName) {
				const methodY = infoY + 18;
				ctx.font = `9px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "left";
				ctx.fillStyle = isCond ? "#f59e0b" : "#888";
				let mText = n.methodName + (isCond ? "?()" : "()");
				const maxMW = n.w - 16;
				while (ctx.measureText(mText).width > maxMW && mText.length > 3) {
					mText = mText.slice(0, -1);
				}
				ctx.fillText(mText, x + 8, methodY);
			}
		}

		ctx.restore();
	}
}

export type { EpNode };
