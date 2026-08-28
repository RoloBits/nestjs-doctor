interface SchemaRelation {
	fromEntity: string;
	toEntity: string;
}

interface SchemaLayoutNode {
	_comp?: number;
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
}

interface SizedNode {
	entity: { columns: unknown[] };
}

export const SCHEMA_BOX_W = 180;
export const SCHEMA_DEFAULT_MAX_COLS = 7;
const COL_GAP = 110;
const ROW_GAP = 44;
const COL_CAP = 2400;

// Groups nodes into connected components via union-find over the relations.
function computeComponents<N extends SchemaLayoutNode>(
	relations: SchemaRelation[],
	nodes: N[]
): N[][] {
	const index: Record<string, number> = {};
	const parent: number[] = [];
	for (let i = 0; i < nodes.length; i++) {
		index[nodes[i].name] = i;
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
		const a = index[rel.fromEntity];
		const b = index[rel.toEntity];
		if (a === undefined || b === undefined) {
			continue;
		}
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) {
			parent[rb] = ra;
		}
	}
	const groups: Record<number, N[]> = {};
	for (let i = 0; i < nodes.length; i++) {
		const root = find(i);
		if (!groups[root]) {
			groups[root] = [];
		}
		groups[root].push(nodes[i]);
	}
	return Object.values(groups);
}

// Positions one component from its own origin: layered left-to-right, ordered
// by neighbor barycenter, over-tall columns split, three relax passes.
function layoutComponent(
	relations: SchemaRelation[],
	nodes: SchemaLayoutNode[]
): { h: number; w: number } {
	if (nodes.length === 1) {
		nodes[0].x = nodes[0].w / 2;
		nodes[0].y = nodes[0].h / 2;
		return { w: nodes[0].w, h: nodes[0].h };
	}
	const idx: Record<string, number> = {};
	for (let i = 0; i < nodes.length; i++) {
		idx[nodes[i].name] = i;
	}
	const n = nodes.length;
	const out: number[][] = [];
	const und: number[][] = [];
	for (let i = 0; i < n; i++) {
		out.push([]);
		und.push([]);
	}
	const seenE: Record<string, boolean> = {};
	for (const rel of relations) {
		if (rel.fromEntity === rel.toEntity) {
			continue;
		}
		const ea = idx[rel.fromEntity];
		const eb = idx[rel.toEntity];
		if (ea === undefined || eb === undefined) {
			continue;
		}
		const ek = ea < eb ? `${ea}|${eb}` : `${eb}|${ea}`;
		if (seenE[ek]) {
			continue;
		}
		seenE[ek] = true;
		out[ea].push(eb);
		und[ea].push(eb);
		und[eb].push(ea);
	}

	// Break cycles: depth-first, back edges are dropped from the working copy
	const color: number[] = [];
	const acyc: number[][] = [];
	for (let i = 0; i < n; i++) {
		color.push(0);
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
	const layer: number[] = [];
	for (let i = 0; i < n; i++) {
		layer.push(-1);
	}
	function assignLayer(u: number): number {
		if (layer[u] >= 0) {
			return layer[u];
		}
		layer[u] = 0;
		let best = 0;
		for (const e of acyc[u]) {
			const d = assignLayer(e) + 1;
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
		const pos: Record<number, number> = {};
		for (let p = 0; p < fixed.length; p++) {
			pos[fixed[p]] = p;
		}
		const keyed: { k: number; o: number; u: number }[] = [];
		for (let p = 0; p < moving.length; p++) {
			const u = moving[p];
			let sum = 0;
			let cnt = 0;
			for (const q of und[u]) {
				if (pos[q] !== undefined) {
					sum += pos[q];
					cnt++;
				}
			}
			keyed.push({ u, k: cnt ? sum / cnt : p, o: p });
		}
		keyed.sort((x, y) => x.k - y.k || x.o - y.o);
		for (let p = 0; p < keyed.length; p++) {
			moving[p] = keyed[p].u;
		}
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
		for (const u2 of col) {
			const hh = nodes[u2].h + ROW_GAP;
			if (runH > 0 && runH + hh > COL_CAP) {
				phys.push(run);
				run = [];
				runH = 0;
			}
			run.push(u2);
			runH += hh;
		}
		if (run.length > 0) {
			phys.push(run);
		}
	}

	// Coordinates: fixed-width columns, stacked rows, then three relax passes
	let xCur = 0;
	for (const col of phys) {
		let yCur = 0;
		for (const u of col) {
			const nd = nodes[u];
			nd.x = xCur + nd.w / 2;
			nd.y = yCur + nd.h / 2;
			yCur += nd.h + ROW_GAP;
		}
		xCur += SCHEMA_BOX_W + COL_GAP;
	}
	for (let t = 0; t < 3; t++) {
		for (const col of phys) {
			const want: number[] = [];
			for (const u3 of col) {
				let s2 = 0;
				let c2 = 0;
				for (const q of und[u3]) {
					s2 += nodes[q].y;
					c2++;
				}
				want.push(c2 > 0 ? s2 / c2 : nodes[u3].y);
			}
			for (let j = 0; j < col.length; j++) {
				nodes[col[j]].y = want[j];
			}
			// The top-down sweep resolves overlaps without reordering the column
			let floorY = Number.NEGATIVE_INFINITY;
			for (const u4 of col) {
				const nd2 = nodes[u4];
				const top = Math.max(nd2.y - nd2.h / 2, floorY);
				nd2.y = top + nd2.h / 2;
				floorY = top + nd2.h + ROW_GAP;
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

// Lays isolated tables out in a near-square grid.
function layoutIsolatedBlock(
	nodes: SchemaLayoutNode[],
	gutter: number
): { h: number; w: number } {
	const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
	let cellW = 0;
	let cellH = 0;
	for (const nd of nodes) {
		if (nd.w > cellW) {
			cellW = nd.w;
		}
		if (nd.h > cellH) {
			cellH = nd.h;
		}
	}
	const rows = Math.ceil(nodes.length / cols);
	for (let j = 0; j < nodes.length; j++) {
		nodes[j].x = (j % cols) * (cellW + gutter) + cellW / 2;
		nodes[j].y = Math.floor(j / cols) * (cellH + gutter) + cellH / 2;
	}
	return {
		w: cols * cellW + (cols - 1) * gutter,
		h: rows * cellH + (rows - 1) * gutter,
	};
}

interface PackedBox {
	h: number;
	ox?: number;
	oy?: number;
	w: number;
}

// Shelf-packs component boxes into a roughly square area.
function packBoxes(boxes: PackedBox[], targetW: number, gutter: number): void {
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

// Positions every node of the overview: components laid out individually,
// isolated tables gathered into one grid block, blocks shelf-packed.
export function computeOverviewLayout(
	relations: SchemaRelation[],
	nodes: SchemaLayoutNode[]
): void {
	const GUTTER = 80;
	const components = computeComponents(relations, nodes);
	const boxes: (PackedBox & { nodes: SchemaLayoutNode[] })[] = [];
	const isolated: SchemaLayoutNode[] = [];

	for (let i = 0; i < components.length; i++) {
		if (components[i].length === 1) {
			components[i][0]._comp = -1;
			isolated.push(components[i][0]);
			continue;
		}
		for (const nd of components[i]) {
			nd._comp = i;
		}
		const size = layoutComponent(relations, components[i]);
		boxes.push({ nodes: components[i], w: size.w, h: size.h });
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
		for (const nd of placed.nodes) {
			nd.x += placed.ox as number;
			nd.y += placed.oy as number;
		}
	}
}

// Columns rendered for a table: capped unless every column is shown.
export function visibleColCount(
	node: SizedNode,
	showCols: boolean,
	showAllCols: boolean
): number {
	if (!showCols) {
		return 0;
	}
	const total = node.entity.columns.length;
	return showAllCols ? total : Math.min(total, SCHEMA_DEFAULT_MAX_COLS);
}

// Header, one row per visible column, the "+N more" row only while capped.
export function nodeHeight(
	node: SizedNode,
	showCols: boolean,
	showAllCols: boolean
): number {
	if (!showCols) {
		return 52;
	}
	const visible = visibleColCount(node, showCols, showAllCols);
	const hidden = node.entity.columns.length - visible;
	return 24 + visible * 16 + (hidden > 0 ? 16 : 0) + 8;
}

// Focused mode: the selected table centred, neighbours on an ellipse around
// it (or beside it when there are only one or two).
export function computeStarLayout(
	nodes: SchemaLayoutNode[],
	centerName: string,
	width: number,
	height: number
): void {
	const center = nodes.find((n) => n.name === centerName);
	if (!center) {
		return;
	}
	const cx = width / 2;
	const cy = height / 2;
	center.x = cx;
	center.y = cy;

	const neighbors = nodes.filter((n) => n.name !== centerName);
	if (neighbors.length === 0) {
		return;
	}

	let maxW = 180;
	let maxH = 52;
	for (const nd of nodes) {
		if (nd.w > maxW) {
			maxW = nd.w;
		}
		if (nd.h > maxH) {
			maxH = nd.h;
		}
	}

	const isLandscape = width >= height;

	if (neighbors.length === 1) {
		if (isLandscape) {
			neighbors[0].x = cx + maxW + 100;
			neighbors[0].y = cy;
		} else {
			neighbors[0].x = cx;
			neighbors[0].y = cy + maxH + 80;
		}
		return;
	}

	if (neighbors.length === 2) {
		if (isLandscape) {
			const hGap = maxW + 100;
			neighbors[0].x = cx - hGap;
			neighbors[0].y = cy;
			neighbors[1].x = cx + hGap;
			neighbors[1].y = cy;
		} else {
			const vGap = maxH + 80;
			neighbors[0].x = cx;
			neighbors[0].y = cy - vGap;
			neighbors[1].x = cx;
			neighbors[1].y = cy + vGap;
		}
		return;
	}

	let rx = width * 0.4 - maxW / 2;
	let ry = height * 0.4 - maxH / 2;
	const minR = maxW / 2 + maxH / 2 + 40;
	if (rx < minR) {
		rx = minR;
	}
	if (ry < minR) {
		ry = minR;
	}

	const startAngle = isLandscape ? 0 : -Math.PI / 2;

	for (let i = 0; i < neighbors.length; i++) {
		const angle = startAngle + (2 * Math.PI * i) / neighbors.length;
		neighbors[i].x = cx + rx * Math.cos(angle);
		neighbors[i].y = cy + ry * Math.sin(angle);
	}
}
