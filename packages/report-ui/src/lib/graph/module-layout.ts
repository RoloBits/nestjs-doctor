/** Minimal structural view of the dagre API the layout needs. */
export interface DagreGraph {
	node(
		id: string
	): { height: number; width: number; x: number; y: number } | undefined;
	setDefaultEdgeLabel(factory: () => unknown): unknown;
	setEdge(from: string, to: string): unknown;
	setGraph(config: unknown): unknown;
	setNode(id: string, value: { width: number; height: number }): unknown;
}

export interface DagreLike {
	graphlib: { Graph: new () => DagreGraph };
	layout(graph: DagreGraph): void;
}

export interface ModuleEdge {
	from: string;
	to: string;
}

export interface LayoutNode {
	h: number;
	name: string;
	project?: string;
	w: number;
	x: number;
	y: number;
}

export interface LayoutCluster {
	h: number;
	header: number;
	innerX: number;
	innerY: number;
	key: string;
	nodes: LayoutNode[];
	w: number;
	x: number;
	y: number;
}

/** A measured size before placement. */
interface Size {
	h: number;
	w: number;
}

/** Groups modules into one cluster per project, first-seen order. */
export function buildClusters(modules: LayoutNode[]): LayoutCluster[] {
	const order: LayoutCluster[] = [];
	const byKey = new Map<string, LayoutCluster>();
	for (const m of modules) {
		const key = m.project ?? "";
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

/** Packs nodes into a compact grid, used when dagre is absent. */
function gridLayout(nodes: LayoutNode[], gutter: number): Size {
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

/** Ranks one cluster from its own origin, with dagre or a grid fallback. */
function layoutCluster(
	nodes: LayoutNode[],
	edges: ModuleEdge[],
	dagre: DagreLike | null
): Size {
	if (nodes.length === 1 || !dagre) {
		return gridLayout(nodes, 30);
	}

	const present = new Set(nodes.map((n) => n.name));

	const g = new dagre.graphlib.Graph();
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
		if (e.from === e.to || !present.has(e.from) || !present.has(e.to)) {
			continue;
		}
		const key = `${e.from}->${e.to}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		g.setEdge(e.from, e.to);
	}

	dagre.layout(g);

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const n of nodes) {
		const laid = g.node(n.name);
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
	boxes: (Size & { x: number; y: number })[],
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

/**
 * Lays every module out inside its project container, then packs the
 * containers. Nodes must already carry w and h.
 */
export function computeLayout(
	modules: LayoutNode[],
	edges: ModuleEdge[],
	dagre?: DagreLike | null
): LayoutCluster[] {
	const GUTTER = 64;
	const PAD = 20;
	const HEADER = 26;
	const clusters = buildClusters(modules);

	for (const c of clusters) {
		const header = c.key ? HEADER : 0;
		const size = layoutCluster(c.nodes, edges, dagre ?? null);
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
		for (const node of box.nodes) {
			node.x += box.x + box.innerX;
			node.y += box.y + box.innerY;
		}
	}
	return clusters;
}

/** Maps each module to the modules that import it. */
export function reverseIndex(edges: ModuleEdge[]): Record<string, string[]> {
	const idx: Record<string, string[]> = {};
	for (const e of edges) {
		if (!idx[e.to]) {
			idx[e.to] = [];
		}
		if (!idx[e.to].includes(e.from)) {
			idx[e.to].push(e.from);
		}
	}
	return idx;
}

export interface BlastRadius {
	byProject: Record<string, number>;
	names: string[];
	projectCount: number;
}

/** Every module that transitively imports this one, counted per project. */
export function blastRadius(
	name: string,
	index: Record<string, string[]>,
	projectOf: (moduleName: string) => string
): BlastRadius {
	const seen = new Set([name]);
	const queue = [name];
	const names: string[] = [];
	const byProject: Record<string, number> = {};
	let projectCount = 0;
	while (queue.length > 0) {
		const incoming = index[queue.shift() as string] ?? [];
		for (const src of incoming) {
			if (seen.has(src)) {
				continue;
			}
			seen.add(src);
			names.push(src);
			queue.push(src);
			const p = projectOf(src) ?? "";
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
