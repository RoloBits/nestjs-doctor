import type { SchemaRelation } from "../model/schema";

export interface SchemaLayoutNode {
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
}

interface PlacedBox {
	h: number;
	nodes: SchemaLayoutNode[];
	ox?: number;
	oy?: number;
	w: number;
}

/** Union-find over entity names; relations join components. */
export function computeComponents(
	relations: SchemaRelation[],
	nodes: SchemaLayoutNode[]
): SchemaLayoutNode[][] {
	const index = new Map<string, number>();
	const parent: number[] = [];
	for (let i = 0; i < nodes.length; i++) {
		index.set(nodes[i].name, i);
		parent.push(i);
	}
	function find(start: number): number {
		let a = start;
		while (parent[a] !== a) {
			parent[a] = parent[parent[a]];
			a = parent[a];
		}
		return a;
	}
	for (const rel of relations) {
		if (rel.fromEntity === rel.toEntity) {
			continue;
		}
		const a = index.get(rel.fromEntity);
		const b = index.get(rel.toEntity);
		if (a === undefined || b === undefined) {
			continue;
		}
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) {
			parent[rb] = ra;
		}
	}
	const groups = new Map<number, SchemaLayoutNode[]>();
	for (let i = 0; i < nodes.length; i++) {
		const root = find(i);
		let group = groups.get(root);
		if (!group) {
			group = [];
			groups.set(root, group);
		}
		group.push(nodes[i]);
	}
	return [...groups.values()];
}

const S_BOX_W = 180;
const S_COL_GAP = 110;
const S_ROW_GAP = 44;
const S_COL_CAP = 2400;

/** Positions one component from its own origin: layered left-to-right. */
export function layoutComponent(
	relations: SchemaRelation[],
	nodes: SchemaLayoutNode[]
): { w: number; h: number } {
	const n = nodes.length;
	if (n === 1) {
		nodes[0].x = nodes[0].w / 2;
		nodes[0].y = nodes[0].h / 2;
		return { w: nodes[0].w, h: nodes[0].h };
	}
	const idx = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		idx.set(nodes[i].name, i);
	}
	const out: number[][] = [];
	const und: number[][] = [];
	for (let i = 0; i < n; i++) {
		out.push([]);
		und.push([]);
	}
	const seenE = new Set<string>();
	for (const rel of relations) {
		if (rel.fromEntity === rel.toEntity) {
			continue;
		}
		const ea = idx.get(rel.fromEntity);
		const eb = idx.get(rel.toEntity);
		if (ea === undefined || eb === undefined) {
			continue;
		}
		const ek = ea < eb ? `${ea}|${eb}` : `${eb}|${ea}`;
		if (seenE.has(ek)) {
			continue;
		}
		seenE.add(ek);
		out[ea].push(eb);
		und[ea].push(eb);
		und[eb].push(ea);
	}

	// Break cycles: depth-first, back edges are dropped from the working copy
	const color: number[] = new Array(n).fill(0);
	const acyc: number[][] = [];
	for (let i = 0; i < n; i++) {
		acyc.push([]);
	}
	function dfsBreak(u: number): void {
		color[u] = 1;
		for (const v of out[u]) {
			if (color[v] === 1) {
				continue;
			}
			acyc[u].push(v);
			if (color[v] === 0) {
				dfsBreak(v);
			}
		}
		color[u] = 2;
	}
	for (let i = 0; i < n; i++) {
		if (color[i] === 0) {
			dfsBreak(i);
		}
	}

	// Layer by longest path from sinks: referenced hubs land in column 0
	const layer: number[] = new Array(n).fill(-1);
	function assignLayer(u: number): number {
		if (layer[u] >= 0) {
			return layer[u];
		}
		layer[u] = 0;
		let best = 0;
		for (const v of acyc[u]) {
			const d = assignLayer(v) + 1;
			if (d > best) {
				best = d;
			}
		}
		layer[u] = best;
		return best;
	}
	for (let i = 0; i < n; i++) {
		assignLayer(i);
	}

	// Order each column by neighbor barycenter, four alternating sweeps
	let maxLayer = 0;
	for (let i = 0; i < n; i++) {
		if (layer[i] > maxLayer) {
			maxLayer = layer[i];
		}
	}
	const cols: number[][] = [];
	for (let i = 0; i <= maxLayer; i++) {
		cols.push([]);
	}
	for (let i = 0; i < n; i++) {
		cols[layer[i]].push(i);
	}
	function sweepPair(fixed: number[], moving: number[]): void {
		const pos = new Map<number, number>();
		for (const [p, u] of fixed.entries()) {
			pos.set(u, p);
		}
		const keyed = moving.map((u, p) => {
			let sum = 0;
			let cnt = 0;
			for (const v of und[u]) {
				const pv = pos.get(v);
				if (pv !== undefined) {
					sum += pv;
					cnt++;
				}
			}
			return { u, k: cnt ? sum / cnt : p, o: p };
		});
		keyed.sort((x, y) => x.k - y.k || x.o - y.o);
		keyed.forEach((k, p) => {
			moving[p] = k.u;
		});
	}
	for (let t = 0; t < 4; t++) {
		for (let i = 1; i < cols.length; i++) {
			sweepPair(cols[i - 1], cols[i]);
		}
		for (let i = cols.length - 2; i >= 0; i--) {
			sweepPair(cols[i + 1], cols[i]);
		}
	}

	// Split an over-tall column into side-by-side runs, keeping the order
	const phys: number[][] = [];
	for (const col of cols) {
		let run: number[] = [];
		let runH = 0;
		for (const u of col) {
			const hh = nodes[u].h + S_ROW_GAP;
			if (runH > 0 && runH + hh > S_COL_CAP) {
				phys.push(run);
				run = [];
				runH = 0;
			}
			run.push(u);
			runH += hh;
		}
		if (run.length > 0) {
			phys.push(run);
		}
	}

	// Coordinates: fixed-width columns, stacked rows, then three relax passes
	let xCur = 0;
	for (const run of phys) {
		let yCur = 0;
		for (const u of run) {
			const nd = nodes[u];
			nd.x = xCur + nd.w / 2;
			nd.y = yCur + nd.h / 2;
			yCur += nd.h + S_ROW_GAP;
		}
		xCur += S_BOX_W + S_COL_GAP;
	}
	for (let t = 0; t < 3; t++) {
		for (const run of phys) {
			const want: number[] = [];
			for (const u of run) {
				let sum = 0;
				let cnt = 0;
				for (const v of und[u]) {
					sum += nodes[v].y;
					cnt++;
				}
				want.push(cnt > 0 ? sum / cnt : nodes[u].y);
			}
			run.forEach((u, j) => {
				nodes[u].y = want[j];
			});
			// The top-down sweep resolves overlaps without reordering the column
			let floorY = Number.NEGATIVE_INFINITY;
			for (const u of run) {
				const nd = nodes[u];
				const top = Math.max(nd.y - nd.h / 2, floorY);
				nd.y = top + nd.h / 2;
				floorY = top + nd.h + S_ROW_GAP;
			}
		}
	}

	// Normalize to origin and report the extent
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const nd of nodes) {
		minX = Math.min(minX, nd.x - nd.w / 2);
		maxX = Math.max(maxX, nd.x + nd.w / 2);
		minY = Math.min(minY, nd.y - nd.h / 2);
		maxY = Math.max(maxY, nd.y + nd.h / 2);
	}
	for (const nd of nodes) {
		nd.x -= minX;
		nd.y -= minY;
	}
	return { w: maxX - minX, h: maxY - minY };
}

/** Packs unrelated tables into a compact grid instead of one long rank. */
export function layoutIsolatedBlock(
	nodes: SchemaLayoutNode[],
	gutter: number
): { w: number; h: number } {
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
	nodes.forEach((n, j) => {
		n.x = (j % cols) * (cellW + gutter) + cellW / 2;
		n.y = Math.floor(j / cols) * (cellH + gutter) + cellH / 2;
	});
	return {
		w: cols * cellW + (cols - 1) * gutter,
		h: rows * cellH + (rows - 1) * gutter,
	};
}

/** Shelf-packs component boxes into a roughly square area. */
function packBoxes(boxes: PlacedBox[], targetW: number, gutter: number): void {
	let x = 0;
	let y = 0;
	let shelfH = 0;
	for (const box of boxes) {
		if (x > 0 && x + box.w > targetW) {
			x = 0;
			y += shelfH + gutter;
			shelfH = 0;
		}
		box.ox = x;
		box.oy = y;
		x += box.w + gutter;
		if (box.h > shelfH) {
			shelfH = box.h;
		}
	}
}

/**
 * Lays the whole overview: components layered and packed, unrelated tables
 * gridded together. Mutates node x/y in place.
 */
export function computeOverviewLayout(
	relations: SchemaRelation[],
	nodes: SchemaLayoutNode[]
): void {
	const GUTTER = 80;
	const components = computeComponents(relations, nodes);
	const boxes: PlacedBox[] = [];
	const isolated: SchemaLayoutNode[] = [];

	for (const component of components) {
		if (component.length === 1) {
			isolated.push(component[0]);
			continue;
		}
		const size = layoutComponent(relations, component);
		boxes.push({ nodes: component, w: size.w, h: size.h });
	}

	boxes.sort((a, b) => b.h - a.h || b.w - a.w);

	if (isolated.length > 0) {
		const isoSize = layoutIsolatedBlock(isolated, 28);
		boxes.push({ nodes: isolated, w: isoSize.w, h: isoSize.h });
	}

	let area = 0;
	for (const box of boxes) {
		area += box.w * box.h;
	}
	const targetW = Math.max(900, Math.sqrt(area) * 1.6);
	packBoxes(boxes, targetW, GUTTER);

	for (const placed of boxes) {
		for (const node of placed.nodes) {
			node.x += placed.ox ?? 0;
			node.y += placed.oy ?? 0;
		}
	}
}

/** Columns drawn per table before the "+N more" line, unless all are shown. */
export const S_DEFAULT_MAX_COLS = 7;

export function visibleColCount(
	entity: { columns: unknown[] },
	showCols: boolean,
	showAllCols: boolean
): number {
	if (!showCols) {
		return 0;
	}
	const total = entity.columns.length;
	return showAllCols ? total : Math.min(total, S_DEFAULT_MAX_COLS);
}

export function nodeHeight(
	entity: { columns: unknown[] },
	showCols: boolean,
	showAllCols: boolean
): number {
	if (!showCols) {
		return 52;
	}
	const visible = visibleColCount(entity, showCols, showAllCols);
	const hidden = entity.columns.length - visible;
	return 24 + visible * 16 + (hidden > 0 ? 16 : 0) + 8;
}
