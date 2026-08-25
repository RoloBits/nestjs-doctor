import type {
	ReportModel,
	SchemaRelation,
	SerializedSchemaEntity,
} from "../model";

const ROW_H = 18;
const HEADER_H = 26;
const BOX_W = 200;
const GAP = 70;

interface SchemaBox {
	entity: SerializedSchemaEntity;
	h: number;
	w: number;
	x: number;
	y: number;
}

/** Grid-places entity boxes by column count, sorted by name. */
export function placeEntities(
	entities: SerializedSchemaEntity[],
	cols = 3
): SchemaBox[] {
	const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
	return sorted.map((entity, i) => {
		const rows = Math.min(entity.columns.length, 14);
		const h = HEADER_H + rows * ROW_H + 8;
		return {
			entity,
			h,
			w: BOX_W,
			x: (i % cols) * (BOX_W + GAP) + GAP,
			y: Math.floor(i / cols) * (h + GAP * 1.4) + GAP,
		};
	});
}

const SINGULAR_TAIL = /s$/;

/** Entity lookup with plural fallback for relation ends (User ↔ users). */
function findBox(boxes: SchemaBox[], name: string): SchemaBox | undefined {
	const lower = name.toLowerCase();
	return (
		boxes.find((b) => b.entity.name.toLowerCase() === lower) ??
		boxes.find(
			(b) => b.entity.name.toLowerCase() === lower.replace(SINGULAR_TAIL, "")
		)
	);
}

interface SchemaEdgeDraw {
	label: string;
	path: Array<{ x: number; y: number }>;
	relation: SchemaRelation;
}

/** Elbow path between the closest sides of two boxes. */
export function edgePath(
	boxes: SchemaBox[],
	r: SchemaRelation
): SchemaEdgeDraw | null {
	const a = findBox(boxes, r.fromEntity);
	const b = findBox(boxes, r.toEntity);
	if (!(a && b) || a === b) {
		return null;
	}
	const aRight = Math.abs(a.x + a.w - b.x) < Math.abs(b.x + b.w - a.x);
	let x1: number;
	let y1: number;
	let x2: number;
	let y2: number;
	if (aRight) {
		x1 = a.x + a.w;
		y1 = a.y + a.h / 2;
		x2 = b.x;
		y2 = b.y + b.h / 2;
	} else {
		x1 = a.x;
		y1 = a.y + a.h / 2;
		x2 = b.x + b.w;
		y2 = b.y + b.h / 2;
	}
	const midX = (x1 + x2) / 2;
	return {
		label: `${r.type}${r.isNullable ? " ?" : ""}`,
		relation: r,
		path: [
			{ x: x1, y: y1 },
			{ x: midX, y: y1 },
			{ x: midX, y: y2 },
			{ x: x2, y: y2 },
		],
	};
}

export function schemaEdges(
	model: ReportModel,
	boxes: SchemaBox[]
): SchemaEdgeDraw[] {
	const out: SchemaEdgeDraw[] = [];
	for (const r of model.schema.relations) {
		const path = edgePath(boxes, r);
		if (path) {
			out.push(path);
		}
	}
	return out;
}

/**
 * Owns the ER canvas. Grid layout instead of the legacy Manhattan router
 * for this pass; routing upgrades land with parity polish.
 */
export class SchemaPainter {
	private readonly ctx: CanvasRenderingContext2D;
	private readonly dead: boolean;

	w = 0;
	h = 0;
	camX = 0;
	camY = 0;
	zoom = 1;
	minZoom = 0.15;
	boxes: SchemaBox[] = [];
	selected: string | null = null;

	private dirty = false;
	private readonly canvas: HTMLCanvasElement;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const raw = canvas.getContext("2d");
		this.dead = !raw;
		this.ctx = raw as CanvasRenderingContext2D;
	}

	setModel(model: ReportModel): void {
		this.model = model;
		this.boxes = placeEntities(model.schema.entities);
		this.scheduleRedraw();
	}

	select(name: string | null): void {
		this.selected = name;
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
		if (this.boxes.length === 0 || this.w === 0) {
			return;
		}
		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const b of this.boxes) {
			minX = Math.min(minX, b.x);
			maxX = Math.max(maxX, b.x + b.w);
			minY = Math.min(minY, b.y);
			maxY = Math.max(maxY, b.y + b.h);
		}
		this.zoom = Math.max(
			this.minZoom,
			Math.min(
				(this.w * 0.92) / (maxX - minX || 1),
				(this.h * 0.92) / (maxY - minY || 1),
				1.4
			)
		);
		this.camX = this.w / 2 - ((minX + maxX) / 2) * this.zoom;
		this.camY = this.h / 2 - ((minY + maxY) / 2) * this.zoom;
		this.scheduleRedraw();
	}

	zoomBy(factor: number): void {
		this.zoom = Math.min(3, Math.max(this.minZoom, this.zoom * factor));
		this.scheduleRedraw();
	}

	hitTest(wx: number, wy: number): SchemaBox | null {
		for (let i = this.boxes.length - 1; i >= 0; i--) {
			const b = this.boxes[i];
			if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
				return b;
			}
		}
		return null;
	}

	focusEntity(name: string): void {
		const box = this.boxes.find((b) => b.entity.name === name);
		if (!box) {
			return;
		}
		this.select(name);
		if (this.dead || this.w === 0) {
			return;
		}
		this.camX = this.w / 2 - (box.x + box.w / 2) * this.zoom;
		this.camY = this.h / 2 - (box.y + box.h / 2) * this.zoom;
		this.scheduleRedraw();
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
		ctx.setTransform(
			this.zoom * (window.devicePixelRatio || 1),
			0,
			0,
			this.zoom * (window.devicePixelRatio || 1),
			this.camX * (window.devicePixelRatio || 1),
			this.camY * (window.devicePixelRatio || 1)
		);

		ctx.font = `10px "IBM Plex Mono", monospace`;
		ctx.textBaseline = "middle";
		for (const box of this.boxes) {
			const dim = this.selected && this.selected !== box.entity.name;
			ctx.globalAlpha = dim ? 0.25 : 1;
			ctx.beginPath();
			ctx.roundRect(box.x, box.y, box.w, box.h, 6);
			ctx.fillStyle = "#14141c";
			ctx.fill();
			ctx.strokeStyle = this.selected === box.entity.name ? "#fff" : "#333";
			ctx.lineWidth = this.selected === box.entity.name ? 2 : 1;
			ctx.stroke();

			ctx.beginPath();
			ctx.rect(box.x, box.y, box.w, HEADER_H);
			ctx.fillStyle = "rgba(234,40,69,0.12)";
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.textAlign = "left";
			ctx.font = `bold 11px "IBM Plex Mono", monospace`;
			ctx.fillText(box.entity.name, box.x + 10, box.y + HEADER_H / 2);

			ctx.font = `10px "IBM Plex Mono", monospace`;
			box.entity.columns.slice(0, 14).forEach((col, i) => {
				const y = box.y + HEADER_H + ROW_H * i + ROW_H / 2;
				ctx.fillStyle = col.isPrimary
					? "var(--score-yellow)"
					: "var(--text-muted)";
				ctx.fillText(
					`${col.isPrimary ? "\u25c9 " : ""}${col.name}`,
					box.x + 10,
					y
				);
				ctx.fillStyle = "var(--text-dim)";
				ctx.textAlign = "right";
				ctx.fillText(col.type.slice(0, 14), box.x + box.w - 10, y);
				ctx.textAlign = "left";
			});
		}

		ctx.globalAlpha = 1;
		for (const edge of schemaEdges(this.model as ReportModel, this.boxes)) {
			const dim =
				this.selected &&
				edge.relation.fromEntity !== this.selected &&
				edge.relation.toEntity !== this.selected;
			ctx.globalAlpha = dim ? 0.12 : 0.85;
			ctx.beginPath();
			edge.path.forEach((p, i) => {
				if (i === 0) {
					ctx.moveTo(p.x, p.y);
				} else {
					ctx.lineTo(p.x, p.y);
				}
			});
			ctx.strokeStyle = "#22d3ee";
			ctx.lineWidth = 1.4;
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		ctx.restore();
	}

	private model: ReportModel | null = null;
}
