import { SCHEMA_BOX_W } from "./schema-layout.js";

interface RoutedNode {
	_comp?: number;
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
}

interface RoutedRelation {
	fromEntity: string;
	propertyName?: string;
	toEntity: string;
}

interface Point {
	x: number;
	y: number;
}

interface Port extends Point {
	dir: string;
}

interface GridColumn {
	boxes: { bot: number; top: number }[];
	left: number;
	right: number;
}

interface GutterRun {
	fromY: number;
	g?: Gutter;
	toY: number;
	x?: number;
}

interface Gutter {
	center: number;
	left: number;
	right: number;
	runs: GutterRun[];
}

interface ComponentGrid {
	colOf: Record<string, number>;
	cols: GridColumn[];
	gutters: Gutter[];
}

const EDGE_MARGIN = 14;
const LANE = 8;

export function pointToSegmentDist(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
	}
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	const projX = ax + t * dx;
	const projY = ay + t * dy;
	return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

export function edgeKey(fromName: string, toName: string): string {
	return fromName < toName ? `${fromName}|${toName}` : `${toName}|${fromName}`;
}

export function segmentHitsBox(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	box: RoutedNode,
	margin: number
): boolean {
	const left = box.x - box.w / 2 - margin;
	const right = box.x + box.w / 2 + margin;
	const top = box.y - box.h / 2 - margin;
	const bottom = box.y + box.h / 2 + margin;

	// Horizontal segment
	if (Math.abs(ay - by) < 1) {
		if (ay < top || ay > bottom) {
			return false;
		}
		const minX = Math.min(ax, bx);
		const maxX = Math.max(ax, bx);
		return maxX > left && minX < right;
	}
	// Vertical segment
	if (Math.abs(ax - bx) < 1) {
		if (ax < left || ax > right) {
			return false;
		}
		const minY = Math.min(ay, by);
		const maxY = Math.max(ay, by);
		return maxY > top && minY < bottom;
	}
	return false;
}

function segmentHitsAnyBox(
	nodes: RoutedNode[],
	ax: number,
	ay: number,
	bx: number,
	by: number,
	excludeA: string,
	excludeB: string
): boolean {
	for (const n of nodes) {
		if (n.name === excludeA || n.name === excludeB) {
			continue;
		}
		if (segmentHitsBox(ax, ay, bx, by, n, EDGE_MARGIN)) {
			return true;
		}
	}
	return false;
}

function computePort(from: RoutedNode, to: RoutedNode): Port {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (Math.abs(dx) >= Math.abs(dy)) {
		if (dx >= 0) {
			return { x: from.x + from.w / 2, y: from.y, dir: "right" };
		}
		return { x: from.x - from.w / 2, y: from.y, dir: "left" };
	}
	if (dy >= 0) {
		return { x: from.x, y: from.y + from.h / 2, dir: "down" };
	}
	return { x: from.x, y: from.y - from.h / 2, dir: "up" };
}

function stepOut(port: Port): Point {
	if (port.dir === "right") {
		return { x: port.x + EDGE_MARGIN, y: port.y };
	}
	if (port.dir === "left") {
		return { x: port.x - EDGE_MARGIN, y: port.y };
	}
	if (port.dir === "down") {
		return { x: port.x, y: port.y + EDGE_MARGIN };
	}
	return { x: port.x, y: port.y - EDGE_MARGIN };
}

// Routes one edge with axis-aligned segments: an L-shape when clear, a
// U-shaped detour otherwise, a direct L as the last resort.
export function routeManhattan(
	nodes: RoutedNode[],
	fromNode: RoutedNode,
	toNode: RoutedNode
): Point[] {
	const portA = computePort(fromNode, toNode);
	const portB = computePort(toNode, fromNode);
	const stepA = stepOut(portA);
	const stepB = stepOut(portB);

	const fromName = fromNode.name;
	const toName = toNode.name;

	// Try L-shape: H then V
	const midX1 = stepB.x;
	const midY1 = stepA.y;
	if (
		!(
			segmentHitsAnyBox(
				nodes,
				stepA.x,
				stepA.y,
				midX1,
				midY1,
				fromName,
				toName
			) ||
			segmentHitsAnyBox(nodes, midX1, midY1, stepB.x, stepB.y, fromName, toName)
		)
	) {
		return simplifyPath([portA, stepA, { x: midX1, y: midY1 }, stepB, portB]);
	}

	// Try L-shape: V then H
	const midX2 = stepA.x;
	const midY2 = stepB.y;
	if (
		!(
			segmentHitsAnyBox(
				nodes,
				stepA.x,
				stepA.y,
				midX2,
				midY2,
				fromName,
				toName
			) ||
			segmentHitsAnyBox(nodes, midX2, midY2, stepB.x, stepB.y, fromName, toName)
		)
	) {
		return simplifyPath([portA, stepA, { x: midX2, y: midY2 }, stepB, portB]);
	}

	// U-shaped detour along a shared horizontal or vertical line
	let bestPath: Point[] | null = null;
	let bestLen = Number.POSITIVE_INFINITY;
	const rails = [
		{ axis: "y", v: Math.min(stepA.y, stepB.y) - 80 },
		{ axis: "y", v: Math.max(stepA.y, stepB.y) + 80 },
		{ axis: "x", v: Math.min(stepA.x, stepB.x) - 80 },
		{ axis: "x", v: Math.max(stepA.x, stepB.x) + 80 },
	];
	for (const rail of rails) {
		const path: Point[] =
			rail.axis === "y"
				? [
						portA,
						stepA,
						{ x: stepA.x, y: rail.v },
						{ x: stepB.x, y: rail.v },
						stepB,
						portB,
					]
				: [
						portA,
						stepA,
						{ x: rail.v, y: stepA.y },
						{ x: rail.v, y: stepB.y },
						stepB,
						portB,
					];
		let blocked = false;
		for (let s = 0; s < path.length - 1; s++) {
			if (
				segmentHitsAnyBox(
					nodes,
					path[s].x,
					path[s].y,
					path[s + 1].x,
					path[s + 1].y,
					fromName,
					toName
				)
			) {
				blocked = true;
				break;
			}
		}
		if (!blocked) {
			let len = 0;
			for (let s = 0; s < path.length - 1; s++) {
				len +=
					Math.abs(path[s + 1].x - path[s].x) +
					Math.abs(path[s + 1].y - path[s].y);
			}
			if (len < bestLen) {
				bestLen = len;
				bestPath = path;
			}
		}
	}

	if (bestPath) {
		return simplifyPath(bestPath);
	}

	// Fallback: direct L-shape (no obstacle avoidance)
	return simplifyPath([portA, stepA, { x: stepB.x, y: stepA.y }, stepB, portB]);
}

// Drops collinear points so every remaining vertex is a real corner.
export function simplifyPath(points: Point[]): Point[] {
	if (points.length <= 2) {
		return points;
	}
	const result = [points[0]];
	for (let i = 1; i < points.length - 1; i++) {
		const prev = result.at(-1) as Point;
		const next = points[i + 1];
		const curr = points[i];
		const sameX =
			Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
		const sameY =
			Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
		if (!(sameX || sameY)) {
			result.push(curr);
		}
	}
	result.push(points.at(-1) as Point);
	return result;
}

// Builds one column/gutter grid per layout component, keyed by _comp.
export function buildGrids(nodes: RoutedNode[]): Record<string, ComponentGrid> {
	const grids: Record<string, ComponentGrid> = {};
	const groups: Record<number, RoutedNode[]> = {};
	for (const nd of nodes) {
		const cid = nd._comp;
		if (cid === undefined || cid < 0) {
			continue;
		}
		if (!groups[cid]) {
			groups[cid] = [];
		}
		groups[cid].push(nd);
	}
	for (const gKey of Object.keys(groups)) {
		const members = groups[Number(gKey)];
		const byX: Record<number, RoutedNode[]> = {};
		for (const nd of members) {
			const cx = Math.round(nd.x);
			if (!byX[cx]) {
				byX[cx] = [];
			}
			byX[cx].push(nd);
		}
		const xs = Object.keys(byX)
			.map(Number)
			.sort((a, b) => a - b);
		const cols: GridColumn[] = [];
		const colOf: Record<string, number> = {};
		for (let i = 0; i < xs.length; i++) {
			const colMembers = byX[xs[i]];
			const boxes: { bot: number; top: number }[] = [];
			for (const m of colMembers) {
				boxes.push({
					top: m.y - m.h / 2 - 8,
					bot: m.y + m.h / 2 + 8,
				});
				colOf[m.name] = i;
			}
			boxes.sort((a, b) => a.top - b.top);
			cols.push({
				left: xs[i] - SCHEMA_BOX_W / 2,
				right: xs[i] + SCHEMA_BOX_W / 2,
				boxes,
			});
		}
		const gutters: Gutter[] = [];
		for (let i = 0; i <= cols.length; i++) {
			const gl = i === 0 ? cols[0].left - 60 : cols[i - 1].right;
			const gr =
				i === cols.length
					? (cols.at(-1) as GridColumn).right + 60
					: cols[i].left;
			gutters.push({ left: gl, right: gr, center: (gl + gr) / 2, runs: [] });
		}
		grids[gKey] = { cols, gutters, colOf };
	}
	return grids;
}

// One y clear across every given column: merged intervals, nearest gap.
export function corridorY(colList: GridColumn[], target: number): number {
	const iv: { bot: number; top: number }[] = [];
	for (const col of colList) {
		for (const box of col.boxes) {
			iv.push({ top: box.top, bot: box.bot });
		}
	}
	if (iv.length === 0) {
		return target;
	}
	iv.sort((a, b) => a.top - b.top);
	const merged = [iv[0]];
	for (let i = 1; i < iv.length; i++) {
		const last = merged.at(-1) as { bot: number; top: number };
		if (iv[i].top <= last.bot + 12) {
			if (iv[i].bot > last.bot) {
				last.bot = iv[i].bot;
			}
		} else {
			merged.push({ top: iv[i].top, bot: iv[i].bot });
		}
	}
	const cands = [merged[0].top - 10];
	for (let i = 0; i + 1 < merged.length; i++) {
		cands.push((merged[i].bot + merged[i + 1].top) / 2);
	}
	cands.push((merged.at(-1) as { bot: number; top: number }).bot + 10);
	let best = cands[0];
	for (let i = 1; i < cands.length; i++) {
		if (Math.abs(cands[i] - target) < Math.abs(best - target)) {
			best = cands[i];
		}
	}
	return best;
}

interface RouteJob {
	a: RoutedNode;
	b: RoutedNode;
	ca: number;
	cb: number;
	grid: ComponentGrid;
	key: string;
	runs?: GutterRun[];
	sideA: string;
	sideB: string;
	ya: number;
	yb: number;
}

// Routes every relation: same-component edges through the gutter channels,
// the rest with Manhattan routing. Port rows come from the injected lookups.
export function channelRouteAll(
	relations: RoutedRelation[],
	nodes: RoutedNode[],
	nodeMap: Record<string, RoutedNode>,
	grids: Record<string, ComponentGrid>,
	portRowY: (node: RoutedNode, colName: string | null) => number,
	relPortNames: (rel: RoutedRelation) => {
		fk: string | null;
		pk: string | null;
	}
): { keys: string[]; routes: Record<string, Point[]> } {
	const routes: Record<string, Point[]> = {};
	const keys: string[] = [];
	const jobs: RouteJob[] = [];
	const seen: Record<string, boolean> = {};
	for (const rel of relations) {
		if (rel.fromEntity === rel.toEntity) {
			continue;
		}
		const a = nodeMap[rel.fromEntity];
		const b = nodeMap[rel.toEntity];
		if (!(a && b)) {
			continue;
		}
		const key = edgeKey(rel.fromEntity, rel.toEntity);
		if (seen[key]) {
			continue;
		}
		seen[key] = true;
		const grid =
			a._comp !== undefined && a._comp === b._comp ? grids[a._comp] : null;
		if (
			!grid ||
			grid.colOf[a.name] === undefined ||
			grid.colOf[b.name] === undefined
		) {
			routes[key] = routeManhattan(nodes, a, b);
			keys.push(key);
			continue;
		}
		const names = relPortNames(rel);
		const ca = grid.colOf[a.name];
		const cb = grid.colOf[b.name];
		let sideA: string;
		let sideB: string;
		if (ca === cb) {
			sideA = "right";
			sideB = "right";
		} else {
			sideA = ca < cb ? "right" : "left";
			sideB = ca < cb ? "left" : "right";
		}
		jobs.push({
			key,
			a,
			b,
			grid,
			ca,
			cb,
			sideA,
			sideB,
			ya: portRowY(a, names.fk),
			yb: portRowY(b, names.pk),
		});
	}

	// Spread ports so a hub's edges fan out instead of stacking on one point
	const byPort: Record<string, { end: string; job: RouteJob }[]> = {};
	for (const jb of jobs) {
		const ka = `${jb.a.name}|${jb.sideA}`;
		const kb = `${jb.b.name}|${jb.sideB}`;
		if (!byPort[ka]) {
			byPort[ka] = [];
		}
		if (!byPort[kb]) {
			byPort[kb] = [];
		}
		byPort[ka].push({ job: jb, end: "a" });
		byPort[kb].push({ job: jb, end: "b" });
	}
	for (const pk of Object.keys(byPort)) {
		const ends = byPort[pk];
		if (ends.length < 2) {
			continue;
		}
		ends.sort((u, v) => {
			const uy = u.end === "a" ? u.job.b.y : u.job.a.y;
			const vy = v.end === "a" ? v.job.b.y : v.job.a.y;
			return uy - vy;
		});
		const node = ends[0].end === "a" ? ends[0].job.a : ends[0].job.b;
		const spread = Math.min(LANE, (node.h - 16) / ends.length);
		for (let j = 0; j < ends.length; j++) {
			const off = (j - (ends.length - 1) / 2) * spread;
			const lo = node.y - node.h / 2 + 8;
			const hi = node.y + node.h / 2 - 8;
			if (ends[j].end === "a") {
				ends[j].job.ya = Math.max(lo, Math.min(hi, ends[j].job.ya + off));
			} else {
				ends[j].job.yb = Math.max(lo, Math.min(hi, ends[j].job.yb + off));
			}
		}
	}

	// Build gutter runs for every edge
	const corridorUse: Record<string, number> = {};
	for (const jb of jobs) {
		const runs: GutterRun[] = [];
		if (jb.ca === jb.cb) {
			runs.push({ g: jb.grid.gutters[jb.ca + 1], fromY: jb.ya, toY: jb.yb });
		} else {
			const step = jb.ca < jb.cb ? 1 : -1;
			const between = jb.grid.cols.slice(
				Math.min(jb.ca, jb.cb) + 1,
				Math.max(jb.ca, jb.cb)
			);
			const gFirst = jb.grid.gutters[step === 1 ? jb.ca + 1 : jb.ca];
			const gLast = jb.grid.gutters[step === 1 ? jb.cb : jb.cb + 1];
			if (between.length === 0) {
				runs.push({ g: gLast, fromY: jb.ya, toY: jb.yb });
			} else {
				let yCorr = corridorY(between, (jb.ya + jb.yb) / 2);
				const bucket = String(Math.round(yCorr / 4));
				const used = corridorUse[bucket] || 0;
				corridorUse[bucket] = used + 1;
				yCorr += (used % 2 === 0 ? 1 : -1) * Math.ceil(used / 2) * 5;
				runs.push({ g: gFirst, fromY: jb.ya, toY: yCorr });
				runs.push({ g: gLast, fromY: yCorr, toY: jb.yb });
			}
		}
		jb.runs = runs;
		for (const rn of runs) {
			rn.g?.runs.push(rn);
		}
	}

	// Lane assignment: spread the vertical runs sharing a gutter
	for (const gk of Object.keys(grids)) {
		const gutters = grids[gk].gutters;
		for (const gut of gutters) {
			const live: GutterRun[] = [];
			for (const rn of gut.runs) {
				if (Math.abs(rn.fromY - rn.toY) >= 0.5) {
					live.push(rn);
				}
			}
			gut.runs = [];
			live.sort((u, v) => (u.fromY + u.toY) / 2 - (v.fromY + v.toY) / 2);
			const lane =
				live.length > 1
					? Math.min(LANE, (gut.right - gut.left - 12) / (live.length - 1))
					: 0;
			for (let j = 0; j < live.length; j++) {
				live[j].x = gut.center + (j - (live.length - 1) / 2) * lane;
			}
		}
	}

	// Materialize the polylines
	for (const jb of jobs) {
		const pts: Point[] = [
			{
				x: jb.sideA === "right" ? jb.a.x + jb.a.w / 2 : jb.a.x - jb.a.w / 2,
				y: jb.ya,
			},
		];
		let curY = jb.ya;
		for (const rn of jb.runs || []) {
			if (Math.abs(rn.fromY - rn.toY) < 0.5) {
				continue;
			}
			pts.push({ x: rn.x as number, y: curY });
			pts.push({ x: rn.x as number, y: rn.toY });
			curY = rn.toY;
		}
		pts.push({
			x: jb.sideB === "right" ? jb.b.x + jb.b.w / 2 : jb.b.x - jb.b.w / 2,
			y: jb.yb,
		});
		routes[jb.key] = simplifyPath(pts);
		keys.push(jb.key);
	}
	return { routes, keys };
}

// Polyline midpoint by arc length, for label placement.
export function polylineMidpoint(points: Point[]): Point {
	if (!points || points.length === 0) {
		return { x: 0, y: 0 };
	}
	if (points.length === 1) {
		return { x: points[0].x, y: points[0].y };
	}
	let totalLen = 0;
	for (let i = 0; i < points.length - 1; i++) {
		totalLen += Math.sqrt(
			(points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
				(points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
		);
	}
	const half = totalLen / 2;
	let walked = 0;
	for (let i = 0; i < points.length - 1; i++) {
		const segLen = Math.sqrt(
			(points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
				(points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
		);
		if (walked + segLen >= half) {
			const t = segLen > 0 ? (half - walked) / segLen : 0;
			return {
				x: points[i].x + t * (points[i + 1].x - points[i].x),
				y: points[i].y + t * (points[i + 1].y - points[i].y),
			};
		}
		walked += segLen;
	}
	const tail = points.at(-1) as Point;
	return { x: tail.x, y: tail.y };
}
