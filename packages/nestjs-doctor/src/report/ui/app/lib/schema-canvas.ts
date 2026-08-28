import type {
	SchemaEntity,
	SerializedSchemaGraph,
} from "../../../../common/schema.js";
import { REPORT_FONT_STACK } from "../../font.js";
import {
	columnKind,
	fkKeys,
	foreignKeyColumns,
	keyName,
} from "./column-kinds.js";
import { escapeHtml } from "./escape.js";
import {
	computeOverviewLayout,
	computeStarLayout,
	nodeHeight,
	SCHEMA_BOX_W,
	visibleColCount,
} from "./schema-layout.js";
import {
	buildGrids,
	channelRouteAll,
	edgeKey,
	pointToSegmentDist,
	polylineMidpoint,
	routeManhattan,
} from "./schema-routing.js";

interface SNode {
	_comp?: number;
	colKinds?: (string | null)[];
	colNames?: string[];
	colTypes?: string[];
	entity: SchemaEntity;
	h: number;
	metaStr?: string;
	name: string;
	nameStr?: string;
	sizeLabel: string;
	w: number;
	x: number;
	y: number;
}

type SchemaRelation = SerializedSchemaGraph["relations"][number];

interface Point {
	x: number;
	y: number;
}

const TYPE_BYTES: Record<string, number> = {
	integer: 4,
	int: 4,
	int4: 4,
	Int: 4,
	serial: 4,
	bigint: 8,
	BigInt: 8,
	int8: 8,
	bigserial: 8,
	smallint: 2,
	int2: 2,
	tinyint: 1,
	float: 8,
	double: 8,
	Float: 8,
	Decimal: 8,
	decimal: 8,
	real: 4,
	float4: 4,
	float8: 8,
	numeric: 8,
	boolean: 1,
	Boolean: 1,
	bool: 1,
	varchar: 256,
	String: 256,
	text: 256,
	char: 64,
	"character varying": 256,
	uuid: 16,
	UUID: 16,
	timestamp: 8,
	DateTime: 8,
	Date: 8,
	date: 4,
	time: 8,
	timestamptz: 8,
	"timestamp without time zone": 8,
	"timestamp with time zone": 8,
	json: 512,
	Json: 512,
	jsonb: 512,
	enum: 4,
	Enum: 4,
	bytea: 256,
	Bytes: 256,
};

const PAREN_SUFFIX = /\(.*\)/;
const BRACKET_SUFFIX = /\[.*\]/;

function estimateRowSize(entity: SchemaEntity): number {
	let total = 0;
	for (const column of entity.columns) {
		const base = column.type
			.replace(PAREN_SUFFIX, "")
			.replace(BRACKET_SUFFIX, "")
			.trim();
		total += TYPE_BYTES[base] || 64;
	}
	return total;
}

function formatBytes(b: number): string {
	if (b >= 1024) {
		return `~${(b / 1024).toFixed(1)} KB`;
	}
	return `~${b} B`;
}

export function relLabel(type: string): string {
	if (type === "one-to-one") {
		return "1:1";
	}
	if (type === "one-to-many") {
		return "1:N";
	}
	if (type === "many-to-one") {
		return "N:1";
	}
	return "N:M";
}

const S_PK_COLOR = "#ea2845";
const S_FK_COLOR = "#8b5cf6";
const S_IDX_COLOR = "#f59e0b";

function drawColumnIcon(
	ctx: CanvasRenderingContext2D,
	kind: string,
	cx: number,
	cy: number
): void {
	ctx.save();
	ctx.lineWidth = 1.1;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	if (kind === "pk") {
		ctx.strokeStyle = S_PK_COLOR;
		ctx.beginPath();
		ctx.arc(cx - 2, cy, 2.1, 0, Math.PI * 2);
		ctx.moveTo(cx + 0.1, cy);
		ctx.lineTo(cx + 4, cy);
		ctx.moveTo(cx + 2.4, cy);
		ctx.lineTo(cx + 2.4, cy + 1.8);
		ctx.moveTo(cx + 4, cy);
		ctx.lineTo(cx + 4, cy + 1.8);
		ctx.stroke();
	} else if (kind === "fk") {
		ctx.strokeStyle = S_FK_COLOR;
		ctx.beginPath();
		ctx.arc(cx - 2.4, cy, 2, 0, Math.PI * 2);
		ctx.moveTo(cx - 0.4, cy);
		ctx.lineTo(cx + 4, cy);
		ctx.moveTo(cx + 2.2, cy - 1.7);
		ctx.lineTo(cx + 4, cy);
		ctx.lineTo(cx + 2.2, cy + 1.7);
		ctx.stroke();
	} else if (kind === "idx") {
		ctx.strokeStyle = S_IDX_COLOR;
		ctx.beginPath();
		ctx.moveTo(cx - 4, cy - 2.4);
		ctx.lineTo(cx + 4, cy - 2.4);
		ctx.moveTo(cx - 4, cy);
		ctx.lineTo(cx + 1.6, cy);
		ctx.moveTo(cx - 4, cy + 2.4);
		ctx.lineTo(cx - 0.6, cy + 2.4);
		ctx.stroke();
	}
	ctx.restore();
}

interface SchemaCanvasCallbacks {
	/** The canvas changed the selection (click or empty-canvas clear). */
	onSelect: (entityName: string | null) => void;
	/** The camera zoom changed; pct is the rounded percentage. */
	onZoom: (pct: number) => void;
}

// The imperative half of the Schema tab: nodes, camera, layouts, routing,
// painting and hover chrome. React owns the sidebar, toolbar and drawer.
export class SchemaCanvas {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D | null;
	private readonly tooltipEl: HTMLElement;
	private readonly relBadgeEl: HTMLElement;
	private readonly schema: SerializedSchemaGraph;
	private readonly callbacks: SchemaCanvasCallbacks;
	private readonly dpr: number;
	private w = 0;
	private h = 0;
	private camX = 0;
	private camY = 0;
	private zoom = 1;
	private dragging: SNode | null = null;
	private panning = false;
	private panStart = { x: 0, y: 0 };
	private dragMoved = false;
	private dragOffset = { x: 0, y: 0 };
	private hoveredEntity: SNode | null = null;
	private hoveredRelation: SchemaRelation | null = null;
	selectedEntity: string | null = null;
	private nodes: SNode[] = [];
	private nodeMap: Record<string, SNode> = {};
	private edgeRoutes: Record<string, Point[]> = {};
	private edgeKeys: string[] = [];
	private readonly allNodes: SNode[] = [];
	focusedMode = false;
	private showCols: boolean | null = null;
	private showAllCols = false;
	private minZoom = 0.2;
	private dirty = false;
	private lastZoomUi: number | null = null;
	private compGrids: ReturnType<typeof buildGrids> | null = null;
	private readonly disposers: (() => void)[] = [];

	constructor(options: {
		callbacks: SchemaCanvasCallbacks;
		canvas: HTMLCanvasElement;
		relBadgeEl: HTMLElement;
		schema: SerializedSchemaGraph;
		tooltipEl: HTMLElement;
	}) {
		this.canvas = options.canvas;
		this.tooltipEl = options.tooltipEl;
		this.relBadgeEl = options.relBadgeEl;
		this.schema = options.schema;
		this.callbacks = options.callbacks;
		this.ctx = this.canvas.getContext("2d");
		this.dpr = window.devicePixelRatio || 1;

		for (const entity of this.schema.entities) {
			const node: SNode = {
				name: entity.name,
				entity,
				x: 0,
				y: 0,
				w: SCHEMA_BOX_W,
				h: 52,
				sizeLabel: formatBytes(estimateRowSize(entity)),
			};
			this.allNodes.push(node);
		}
		this.nodes = this.allNodes.slice();
		this.rebuildNodeMap();
		this.cacheNodeLabels(this.allNodes);
		this.focusedMode = this.schema.entities.length > 7;
		this.bindEvents();
	}

	/** True when the focused mode starts with nothing selected. */
	startsEmpty(): boolean {
		return this.focusedMode;
	}

	init(): void {
		this.resize();
		if (this.focusedMode) {
			this.nodes = [];
			this.nodeMap = {};
			this.edgeRoutes = {};
			this.edgeKeys = [];
		} else {
			this.applyNodeSizes(this.nodes);
			this.computeOverview();
			this.centerCamera();
		}
		this.scheduleRedraw();
	}

	destroy(): void {
		for (const dispose of this.disposers) {
			dispose();
		}
	}

	hasNodes(): boolean {
		return this.nodes.length > 0;
	}

	// ── State entry points driven by React ──

	selectFromSidebar(name: string): void {
		this.selectedEntity = name;
		if (this.focusedMode) {
			this.setVisibleSubset(name);
		} else {
			this.panToEntity(name);
			this.scheduleRedraw();
		}
	}

	selectFromDrawer(name: string): void {
		this.selectedEntity = name;
		if (this.focusedMode) {
			this.setVisibleSubset(name);
		} else {
			this.panToEntity(name);
			this.scheduleRedraw();
		}
	}

	showAllTables(): void {
		this.focusedMode = false;
		this.nodes = this.allNodes.slice();
		this.rebuildNodeMap();
		this.applyNodeSizes(this.nodes);
		this.computeOverview();
		this.centerCamera();
		this.scheduleRedraw();
	}

	focusOneTable(): void {
		this.focusedMode = true;
		this.setVisibleSubset(this.selectedEntity);
		this.scheduleRedraw();
	}

	setShowAllCols(showAllCols: boolean): void {
		this.showAllCols = showAllCols;
		if (showAllCols) {
			this.showCols = true;
		}
		this.relayoutForSizeChange();
	}

	setShowCols(showCols: boolean): void {
		this.showCols = showCols;
		this.applyNodeSizes(this.nodes);
		if (this.focusedMode && this.selectedEntity) {
			this.setVisibleSubset(this.selectedEntity);
		} else {
			this.computeOverview();
			this.centerCamera();
			this.scheduleRedraw();
		}
	}

	recenter(): void {
		this.centerCamera();
		this.syncZoomUi();
		this.scheduleRedraw();
	}

	setZoomPct(pct: number): void {
		this.setZoom(pct / 100);
	}

	zoomIn(): void {
		this.setZoom(this.zoom * 1.2);
	}

	zoomOut(): void {
		this.setZoom(this.zoom / 1.2);
	}

	resize(): void {
		if (!this.ctx) {
			return;
		}
		const container = this.canvas.parentElement;
		if (!container) {
			return;
		}
		const prevW = this.w;
		const prevH = this.h;
		this.w = container.clientWidth;
		this.h = container.clientHeight;
		if (prevW && prevH) {
			this.camX += (this.w - prevW) / 2;
			this.camY += (this.h - prevH) / 2;
		}
		this.canvas.width = this.w * this.dpr;
		this.canvas.height = this.h * this.dpr;
		this.canvas.style.width = `${this.w}px`;
		this.canvas.style.height = `${this.h}px`;
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		if (this.focusedMode && this.selectedEntity && this.nodes.length > 0) {
			computeStarLayout(this.nodes, this.selectedEntity, this.w, this.h);
			this.routeAllEdges();
			this.centerCamera();
		}
		this.scheduleRedraw();
	}

	// ── Internals, ported line for line from the script chunk ──

	private rebuildNodeMap(): void {
		this.nodeMap = {};
		for (const node of this.nodes) {
			this.nodeMap[node.name] = node;
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

	private zoomFloor(): number {
		return Math.min(this.minZoom, 0.05);
	}

	private syncZoomUi(): void {
		const pct = Math.round(this.zoom * 100);
		if (pct === this.lastZoomUi) {
			return;
		}
		this.lastZoomUi = pct;
		this.callbacks.onZoom(pct);
	}

	private setZoom(next: number): void {
		this.zoom = Math.max(this.zoomFloor(), Math.min(5, next));
		this.syncZoomUi();
		this.scheduleRedraw();
	}

	private screenToWorld(sx: number, sy: number): Point {
		return {
			x: (sx - this.w / 2) / this.zoom + this.w / 2 - this.camX,
			y: (sy - this.h / 2) / this.zoom + this.h / 2 - this.camY,
		};
	}

	private hitTestEntity(wx: number, wy: number): SNode | null {
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i] as SNode;
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

	private getRelatedEntities(entityName: string): Set<string> {
		const related = new Set<string>();
		related.add(entityName);
		for (const rel of this.schema.relations) {
			if (rel.fromEntity === entityName) {
				related.add(rel.toEntity);
			}
			if (rel.toEntity === entityName) {
				related.add(rel.fromEntity);
			}
		}
		return related;
	}

	private hitTestRelation(wx: number, wy: number): SchemaRelation | null {
		const threshold = 8 / this.zoom;
		for (const key of this.edgeKeys) {
			const points = this.edgeRoutes[key];
			if (!points || points.length < 2) {
				continue;
			}
			for (let p = 0; p < points.length - 1; p++) {
				const a = points[p] as Point;
				const b = points[p + 1] as Point;
				const d = pointToSegmentDist(wx, wy, a.x, a.y, b.x, b.y);
				if (d < threshold) {
					const parts = key.split("|");
					for (const rel of this.schema.relations) {
						if (rel.fromEntity === parts[0] && rel.toEntity === parts[1]) {
							return rel;
						}
						if (rel.fromEntity === parts[1] && rel.toEntity === parts[0]) {
							return rel;
						}
					}
				}
			}
		}
		return null;
	}

	private portRowY(node: SNode, colName: string | null): number {
		const top = node.y - node.h / 2;
		const showCols = this.columnsShown(this.nodes.length);
		const visible = visibleColCount(node, showCols, this.showAllCols);
		if (colName) {
			const key = keyName(colName);
			for (let i = 0; i < node.entity.columns.length && i < visible; i++) {
				if (
					keyName((node.entity.columns[i] as { name: string }).name) === key
				) {
					return top + 24 + i * 16 + 8;
				}
			}
		}
		return top + 12;
	}

	private relPortNames(rel: SchemaRelation): {
		fk: string | null;
		pk: string | null;
	} {
		const child = this.nodeMap[rel.fromEntity];
		let fkName: string | null = null;
		if (child && rel.propertyName) {
			const keys = fkKeys(rel.propertyName);
			for (const column of child.entity.columns) {
				const kn = keyName(column.name);
				if (kn === keys[0] || kn === keys[1]) {
					fkName = column.name;
					break;
				}
			}
		}
		const parent = this.nodeMap[rel.toEntity];
		let pkName: string | null = null;
		if (parent) {
			for (const column of parent.entity.columns) {
				if (column.isPrimary) {
					pkName = column.name;
					break;
				}
			}
		}
		return { fk: fkName, pk: pkName };
	}

	private routeAllEdges(): void {
		this.edgeRoutes = {};
		this.edgeKeys = [];
		if (this.compGrids) {
			const out = channelRouteAll(
				this.schema.relations,
				this.nodes,
				this.nodeMap,
				this.compGrids,
				(node, colName) => this.portRowY(node as SNode, colName),
				(rel) => this.relPortNames(rel as SchemaRelation)
			);
			this.edgeRoutes = out.routes;
			this.edgeKeys = out.keys;
			return;
		}
		const seen: Record<string, boolean> = {};
		for (const rel of this.schema.relations) {
			if (rel.fromEntity === rel.toEntity) {
				continue;
			}
			const a = this.nodeMap[rel.fromEntity];
			const b = this.nodeMap[rel.toEntity];
			if (!(a && b)) {
				continue;
			}
			if (
				this.focusedMode &&
				this.selectedEntity &&
				rel.fromEntity !== this.selectedEntity &&
				rel.toEntity !== this.selectedEntity
			) {
				continue;
			}
			const key = edgeKey(rel.fromEntity, rel.toEntity);
			if (seen[key]) {
				continue;
			}
			seen[key] = true;
			this.edgeRoutes[key] = routeManhattan(this.nodes, a, b);
			this.edgeKeys.push(key);
		}
	}

	private rerouteEdgesForNode(name: string): void {
		for (const key of this.edgeKeys) {
			const parts = key.split("|");
			if (parts[0] === name || parts[1] === name) {
				const a = this.nodeMap[parts[0] as string];
				const b = this.nodeMap[parts[1] as string];
				if (a && b) {
					this.edgeRoutes[key] = routeManhattan(this.nodes, a, b);
				}
			}
		}
	}

	private computeOverview(): void {
		computeOverviewLayout(this.schema.relations, this.nodes);
		this.compGrids = buildGrids(this.nodes);
		this.routeAllEdges();
	}

	private columnsShown(count: number): boolean {
		if (this.showCols !== null) {
			return this.showCols;
		}
		return !this.focusedMode || count <= 5;
	}

	private applyNodeSizes(nodes: SNode[]): boolean {
		const showCols = this.columnsShown(nodes.length);
		for (const node of nodes) {
			node.w = SCHEMA_BOX_W;
			node.h = nodeHeight(node, showCols, this.showAllCols);
		}
		return showCols;
	}

	private cacheNodeLabels(nodes: SNode[]): void {
		const ctx = this.ctx;
		if (!ctx) {
			return;
		}
		const maxNameW = SCHEMA_BOX_W - 20 - 8;
		const maxMetaW = SCHEMA_BOX_W - 16;
		const clip = (text: string, maxW: number): string => {
			if (ctx.measureText(text).width <= maxW) {
				return text;
			}
			let out = text;
			while (ctx.measureText(out).width > maxW && out.length > 3) {
				out = out.slice(0, -1);
			}
			return `${out}…`;
		};
		for (const n of nodes) {
			ctx.font = `bold 12px ${REPORT_FONT_STACK}`;
			n.nameStr = clip(n.name, maxNameW);
			ctx.font = `11px ${REPORT_FONT_STACK}`;
			n.metaStr = clip(
				`${n.entity.columns.length} cols  ·  ${n.sizeLabel}`,
				maxMetaW
			);
			ctx.font = `10px ${REPORT_FONT_STACK}`;
			n.colTypes = n.entity.columns.map((c) => clip(c.type, 60));
			const foreignKeys = foreignKeyColumns(n.entity);
			ctx.font = `11px ${REPORT_FONT_STACK}`;
			n.colNames = n.entity.columns.map((c) => clip(c.name, 83));
			n.colKinds = n.entity.columns.map((c) => columnKind(c, foreignKeys));
		}
	}

	private relayoutForSizeChange(): void {
		this.applyNodeSizes(this.nodes);
		if (this.focusedMode && this.selectedEntity) {
			this.setVisibleSubset(this.selectedEntity);
		} else if (!this.focusedMode) {
			this.computeOverview();
			this.centerCamera();
			this.scheduleRedraw();
		}
	}

	private setVisibleSubset(entityName: string | null): void {
		if (!this.focusedMode) {
			return;
		}
		this.compGrids = null;
		if (!entityName) {
			this.nodes = [];
			this.nodeMap = {};
			this.edgeRoutes = {};
			this.edgeKeys = [];
			return;
		}
		const related = this.getRelatedEntities(entityName);
		this.nodes = this.allNodes.filter((node) => related.has(node.name));
		this.rebuildNodeMap();
		this.applyNodeSizes(this.nodes);
		computeStarLayout(this.nodes, entityName, this.w, this.h);
		this.routeAllEdges();
		this.centerCamera();
		this.scheduleRedraw();
	}

	private panToEntity(name: string): void {
		const node = this.nodeMap[name];
		if (!node) {
			return;
		}
		this.camX = this.w / 2 - node.x;
		this.camY = this.h / 2 - node.y;
		this.scheduleRedraw();
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
		const padW = this.w * 0.85;
		const padH = this.h * 0.85;
		const fit = Math.min(
			1.5,
			Math.min(padW / (graphW || 1), padH / (graphH || 1))
		);
		this.minZoom = Math.min(0.2, fit);
		this.zoom = Math.max(this.minZoom, fit);
		const showingCols = this.columnsShown(this.nodes.length);
		if (showingCols && this.zoom < 0.75) {
			this.zoom = 0.75;
			const pad = 40;
			this.camX = (pad - this.w / 2) / this.zoom + this.w / 2 - minX;
			this.camY = (pad - this.h / 2) / this.zoom + this.h / 2 - minY;
			return;
		}
		this.camX = this.w / 2 - cx;
		this.camY = this.h / 2 - cy;
	}

	private showTooltip(
		entity: SchemaEntity,
		screenX: number,
		screenY: number
	): void {
		let colsHtml = "";
		const maxCols = Math.min(entity.columns.length, 12);
		for (let i = 0; i < maxCols; i++) {
			const c = entity.columns[i] as { name: string; type: string };
			colsHtml += `<li><span class="col-name">${escapeHtml(c.name)}</span> <span class="col-type">${escapeHtml(c.type)}</span></li>`;
		}
		if (entity.columns.length > maxCols) {
			colsHtml += `<li style="color:var(--text-dim)">+ ${entity.columns.length - maxCols} more</li>`;
		}
		const tableInfo =
			entity.tableName && entity.tableName !== entity.name
				? `<div class="tt-table">Table: ${escapeHtml(entity.tableName)}</div>`
				: "";
		this.tooltipEl.innerHTML =
			`<div class="tt-name">${escapeHtml(entity.name)}</div>` +
			tableInfo +
			`<ul class="tt-cols">${colsHtml}</ul>` +
			`<div class="tt-size">${formatBytes(estimateRowSize(entity))} est. row size</div>`;
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

	private showRelBadge(
		rel: SchemaRelation,
		screenX: number,
		screenY: number
	): void {
		const label = relLabel(rel.type);
		this.relBadgeEl.innerHTML =
			`<span class="rb-type">${label}</span>` +
			`${escapeHtml(rel.fromEntity)}<span class="rb-arrow">→</span>${escapeHtml(rel.toEntity)}` +
			` <span style="color:var(--text-dim);font-size:10px">${escapeHtml(rel.propertyName)}</span>`;
		this.relBadgeEl.style.display = "block";
		this.relBadgeEl.style.left = `${screenX + 16}px`;
		this.relBadgeEl.style.top = `${screenY - 10}px`;
		requestAnimationFrame(() => {
			const parent = this.canvas.parentElement;
			if (!parent) {
				return;
			}
			const mainRect = parent.getBoundingClientRect();
			const r = this.relBadgeEl.getBoundingClientRect();
			if (r.right > mainRect.right - 8) {
				this.relBadgeEl.style.left = `${screenX - r.width - 8}px`;
			}
			if (r.bottom > mainRect.bottom - 8) {
				this.relBadgeEl.style.top = `${screenY - r.height - 8}px`;
			}
		});
	}

	private hideRelBadge(): void {
		this.relBadgeEl.style.display = "none";
	}

	private on(
		target: HTMLElement,
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
			const rect = this.canvas.getBoundingClientRect();
			const pos = this.screenToWorld(
				e.clientX - rect.left,
				e.clientY - rect.top
			);
			const hit = this.hitTestEntity(pos.x, pos.y);
			this.dragMoved = false;
			this.panStart = { x: e.clientX, y: e.clientY };
			if (hit) {
				this.dragging = hit;
				this.dragOffset = { x: hit.x - pos.x, y: hit.y - pos.y };
				this.hideTooltip();
				this.hideRelBadge();
			} else {
				this.panning = true;
			}
		}) as EventListener);

		this.on(this.canvas, "mousemove", ((e: MouseEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const pos = this.screenToWorld(sx, sy);

			if (
				(this.dragging || this.panning) &&
				!this.dragMoved &&
				Math.abs(e.clientX - this.panStart.x) < 4 &&
				Math.abs(e.clientY - this.panStart.y) < 4
			) {
				return;
			}

			if (this.dragging) {
				this.dragMoved = true;
				this.dragging.x = pos.x + this.dragOffset.x;
				this.dragging.y = pos.y + this.dragOffset.y;
				this.rerouteEdgesForNode(this.dragging.name);
				this.scheduleRedraw();
				this.hideTooltip();
				this.hideRelBadge();
			} else if (this.panning) {
				this.dragMoved = true;
				this.camX += (e.clientX - this.panStart.x) / this.zoom;
				this.camY += (e.clientY - this.panStart.y) / this.zoom;
				this.panStart = { x: e.clientX, y: e.clientY };
				this.scheduleRedraw();
				this.hideTooltip();
				this.hideRelBadge();
			} else {
				const hitEntity = this.hitTestEntity(pos.x, pos.y);
				const hitRel = hitEntity ? null : this.hitTestRelation(pos.x, pos.y);

				if (hitEntity !== this.hoveredEntity) {
					this.hoveredEntity = hitEntity;
					this.canvas.style.cursor = hitEntity ? "pointer" : "grab";
					if (hitEntity) {
						this.showTooltip(hitEntity.entity, sx, sy);
					} else {
						this.hideTooltip();
					}
					this.scheduleRedraw();
				} else if (hitEntity) {
					this.tooltipEl.style.left = `${sx + 16}px`;
					this.tooltipEl.style.top = `${sy - 10}px`;
				}

				if (hitRel !== this.hoveredRelation) {
					this.hoveredRelation = hitRel;
					if (!hitEntity) {
						this.canvas.style.cursor = hitRel ? "pointer" : "grab";
					}
					if (hitRel) {
						this.showRelBadge(hitRel, sx, sy);
					} else {
						this.hideRelBadge();
					}
					this.scheduleRedraw();
				} else if (hitRel) {
					this.relBadgeEl.style.left = `${sx + 16}px`;
					this.relBadgeEl.style.top = `${sy - 10}px`;
				}
			}
		}) as EventListener);

		this.on(this.canvas, "mouseup", () => {
			if (this.dragging && !this.dragMoved) {
				this.selectedEntity =
					this.selectedEntity === this.dragging.name
						? null
						: this.dragging.name;
				this.callbacks.onSelect(this.selectedEntity);
				if (this.focusedMode) {
					this.setVisibleSubset(this.selectedEntity);
				} else {
					this.scheduleRedraw();
				}
			} else if (this.panning && !this.dragMoved && this.selectedEntity) {
				this.selectedEntity = null;
				this.callbacks.onSelect(null);
				if (this.focusedMode) {
					this.setVisibleSubset(null);
				} else {
					this.scheduleRedraw();
				}
			}
			this.dragging = null;
			this.panning = false;
			this.dragMoved = false;
		});

		this.on(this.canvas, "mouseleave", () => {
			this.hoveredEntity = null;
			this.hoveredRelation = null;
			this.hideTooltip();
			this.hideRelBadge();
			this.scheduleRedraw();
		});

		this.on(
			this.canvas,
			"wheel",
			((e: WheelEvent) => {
				e.preventDefault();
				// ctrlKey or metaKey means a pinch, which zooms; anything else pans.
				if (e.ctrlKey || e.metaKey) {
					const factor = e.deltaY > 0 ? 0.92 : 1.08;
					this.zoom = Math.max(
						this.zoomFloor(),
						Math.min(5, this.zoom * factor)
					);
				} else {
					this.camX -= e.deltaX / this.zoom;
					this.camY -= e.deltaY / this.zoom;
					this.hideTooltip();
					this.hideRelBadge();
				}
				this.scheduleRedraw();
			}) as EventListener,
			{ passive: false }
		);
	}

	private drawRelations(
		ctx: CanvasRenderingContext2D,
		selectedRelated: Set<string> | null
	): void {
		const drawnEdges: Record<string, boolean> = {};
		for (const rel of this.schema.relations) {
			if (rel.fromEntity === rel.toEntity) {
				continue;
			}
			const a = this.nodeMap[rel.fromEntity];
			const b = this.nodeMap[rel.toEntity];
			if (!(a && b)) {
				continue;
			}
			if (
				this.focusedMode &&
				this.selectedEntity &&
				rel.fromEntity !== this.selectedEntity &&
				rel.toEntity !== this.selectedEntity
			) {
				continue;
			}
			const key = edgeKey(rel.fromEntity, rel.toEntity);
			if (drawnEdges[key]) {
				continue;
			}
			drawnEdges[key] = true;
			const points = this.edgeRoutes[key];
			if (!points || points.length < 2) {
				continue;
			}
			const isHovered =
				this.hoveredRelation !== null &&
				edgeKey(
					this.hoveredRelation.fromEntity,
					this.hoveredRelation.toEntity
				) === key;
			const dimmed =
				selectedRelated &&
				!(
					selectedRelated.has(rel.fromEntity) &&
					selectedRelated.has(rel.toEntity)
				);

			ctx.globalAlpha = dimmed ? 0.12 : 1;

			ctx.beginPath();
			ctx.moveTo((points[0] as Point).x, (points[0] as Point).y);
			const cornerR = 3 / this.zoom;
			for (let p = 1; p < points.length - 1; p++) {
				ctx.arcTo(
					(points[p] as Point).x,
					(points[p] as Point).y,
					(points[p + 1] as Point).x,
					(points[p + 1] as Point).y,
					cornerR
				);
			}
			const lastPoint = points.at(-1) as Point;
			ctx.lineTo(lastPoint.x, lastPoint.y);

			if (isHovered) {
				ctx.save();
				ctx.shadowColor = "#ffffff";
				ctx.shadowBlur = 8;
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2.5 / this.zoom;
				ctx.stroke();
				ctx.restore();
			} else {
				ctx.strokeStyle = "#555";
				ctx.lineWidth = 1.5 / this.zoom;
				ctx.stroke();
			}

			if (this.zoom >= 0.35) {
				const mid = polylineMidpoint(points);
				ctx.font = `${10 / this.zoom}px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillStyle = isHovered ? "#ffffff" : "#666";
				ctx.fillText(relLabel(rel.type), mid.x, mid.y - 4 / this.zoom);
			}
		}
		ctx.globalAlpha = 1;
	}

	private drawNode(
		ctx: CanvasRenderingContext2D,
		n: SNode,
		showCols: boolean,
		selectedRelated: Set<string> | null
	): void {
		const HDR_H = 24;
		const COL_ROW_H = 16;
		const cols = n.entity.columns;
		const visible = visibleColCount(n, showCols, this.showAllCols);
		const hasMore = cols.length > visible;
		const x = n.x - SCHEMA_BOX_W / 2;
		const y = n.y - n.h / 2;
		const isSelected = this.selectedEntity === n.name;
		const isHovered = this.hoveredEntity?.name === n.name;
		const isHoverConnected =
			this.hoveredRelation !== null &&
			(this.hoveredRelation.fromEntity === n.name ||
				this.hoveredRelation.toEntity === n.name);
		const dimmed = selectedRelated && !selectedRelated.has(n.name);

		ctx.globalAlpha = dimmed ? 0.15 : 1;

		if (isSelected) {
			ctx.save();
			ctx.shadowColor = "rgba(234,40,69,0.4)";
			ctx.shadowBlur = 12;
		}

		ctx.beginPath();
		ctx.rect(x, y, SCHEMA_BOX_W, n.h);
		ctx.fillStyle = "#151515";
		ctx.fill();

		let border = "rgba(255,255,255,0.06)";
		if (isSelected) {
			border = "#ea2845";
		} else if (isHoverConnected || isHovered) {
			border = "#ffffff";
		}
		ctx.strokeStyle = border;
		ctx.lineWidth = isSelected || isHoverConnected || isHovered ? 2 : 1;
		ctx.stroke();

		if (isSelected) {
			ctx.restore();
		}

		ctx.fillStyle = "#0d0d0d";
		ctx.fillRect(x, y, SCHEMA_BOX_W, HDR_H);

		ctx.beginPath();
		ctx.moveTo(x + 1, y + HDR_H);
		ctx.lineTo(x + SCHEMA_BOX_W - 1, y + HDR_H);
		ctx.strokeStyle = "rgba(255,255,255,0.06)";
		ctx.lineWidth = 1;
		ctx.stroke();

		const iconSize = 6;
		const iconX = x + 8;
		const iconY = y + HDR_H / 2 - iconSize / 2;
		ctx.fillStyle = "#ea2845";
		ctx.fillRect(iconX, iconY, iconSize, iconSize);

		// Below this zoom the glyphs are sub-pixel mush.
		if (this.zoom >= 0.15) {
			ctx.fillStyle = "#e0e0e0";
			ctx.font = `bold 12px ${REPORT_FONT_STACK}`;
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(n.nameStr || n.name, iconX + iconSize + 6, y + HDR_H / 2);
		}

		// Body text is skipped below the zoom where a row is about a pixel tall.
		const showBodyText = this.zoom >= 0.35;
		if (showCols && showBodyText) {
			let colY = y + HDR_H;
			for (let c = 0; c < visible; c++) {
				const col = cols[c] as { name: string; type: string };
				const kind = n.colKinds ? n.colKinds[c] : null;
				if (kind) {
					drawColumnIcon(ctx, kind, x + 13, colY + COL_ROW_H / 2);
				}
				ctx.fillStyle = kind === "pk" ? "#e0e0e0" : "#ccc";
				ctx.font = `11px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText(
					n.colNames ? (n.colNames[c] as string) : col.name,
					x + 21,
					colY + COL_ROW_H / 2
				);
				ctx.fillStyle = "#3b82f6";
				ctx.font = `10px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "right";
				ctx.fillText(
					n.colTypes ? (n.colTypes[c] as string) : col.type,
					x + SCHEMA_BOX_W - 10,
					colY + COL_ROW_H / 2
				);
				colY += COL_ROW_H;
			}
			if (hasMore) {
				ctx.fillStyle = "#666";
				ctx.font = `10px ${REPORT_FONT_STACK}`;
				ctx.textAlign = "left";
				ctx.fillText(
					`+${cols.length - visible} more`,
					x + 10,
					colY + COL_ROW_H / 2
				);
			}
		} else if (!showCols && showBodyText) {
			ctx.fillStyle = "#666";
			ctx.font = `11px ${REPORT_FONT_STACK}`;
			ctx.fillText(n.metaStr || "", x + 8, y + HDR_H + (n.h - HDR_H) / 2);
		}
	}

	private draw(): void {
		this.syncZoomUi();
		const ctx = this.ctx;
		if (!ctx || this.nodes.length === 0) {
			return;
		}
		ctx.save();
		ctx.clearRect(0, 0, this.w, this.h);
		ctx.translate(this.w / 2, this.h / 2);
		ctx.scale(this.zoom, this.zoom);
		ctx.translate(-this.w / 2 + this.camX, -this.h / 2 + this.camY);

		const selectedRelated = this.selectedEntity
			? this.getRelatedEntities(this.selectedEntity)
			: null;

		this.drawRelations(ctx, selectedRelated);

		const showCols = this.applyNodeSizes(this.nodes);
		for (const n of this.nodes) {
			this.drawNode(ctx, n, showCols, selectedRelated);
		}
		ctx.globalAlpha = 1;
		ctx.restore();
	}
}
