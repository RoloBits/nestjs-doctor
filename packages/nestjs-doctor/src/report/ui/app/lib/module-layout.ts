interface ModuleNode {
	h: number;
	name: string;
	project?: string;
	w: number;
	x: number;
	y: number;
}

interface ModuleEdge {
	from: string;
	to: string;
}

interface Cluster {
	h: number;
	header: number;
	innerX: number;
	innerY: number;
	key: string;
	nodes: ModuleNode[];
	w: number;
	x: number;
	y: number;
}

interface DagreLike {
	graphlib: {
		Graph: new () => {
			node(name: string): { x: number; y: number } | undefined;
			setDefaultEdgeLabel(fn: () => object): void;
			setEdge(from: string, to: string): void;
			setGraph(options: object): void;
			setNode(name: string, size: { height: number; width: number }): void;
		};
	};
	layout(g: object): void;
}

// Groups modules into one cluster per project, keeping first-seen order.
function buildClusters(modules: ModuleNode[]): Cluster[] {
	const order: Cluster[] = [];
	const byKey: Record<string, Cluster> = {};
	for (const mod of modules) {
		const key = mod.project || "";
		if (!byKey[key]) {
			byKey[key] = {
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
			order.push(byKey[key]);
		}
		byKey[key].nodes.push(mod);
	}
	return order;
}

// Packs nodes into a compact grid, used when dagre is absent.
function gridLayout(
	nodes: ModuleNode[],
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
	for (let i = 0; i < nodes.length; i++) {
		nodes[i].x = (i % cols) * (cellW + gutter) + cellW / 2;
		nodes[i].y = Math.floor(i / cols) * (cellH + gutter) + cellH / 2;
	}
	return {
		w: cols * cellW + (cols - 1) * gutter,
		h: rows * cellH + (rows - 1) * gutter,
	};
}

// Ranks one cluster from its own origin, with dagre or a grid fallback.
function layoutCluster(
	nodes: ModuleNode[],
	edges: ModuleEdge[],
	dagre: DagreLike | undefined
): { h: number; w: number } {
	if (nodes.length === 1 || dagre === undefined) {
		return gridLayout(nodes, 30);
	}

	const present: Record<string, boolean> = {};
	for (const nd of nodes) {
		present[nd.name] = true;
	}

	const g = new dagre.graphlib.Graph();
	g.setGraph({
		rankdir: "TB",
		nodesep: 26,
		ranksep: 58,
		marginx: 0,
		marginy: 0,
	});
	g.setDefaultEdgeLabel(() => ({}));
	for (const nd of nodes) {
		g.setNode(nd.name, { width: nd.w, height: nd.h });
	}

	const seen: Record<string, boolean> = {};
	for (const e of edges) {
		if (e.from === e.to) {
			continue;
		}
		if (!(present[e.from] && present[e.to])) {
			continue;
		}
		const key = `${e.from}->${e.to}`;
		if (seen[key]) {
			continue;
		}
		seen[key] = true;
		g.setEdge(e.from, e.to);
	}

	dagre.layout(g);

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const nd of nodes) {
		const laid = g.node(nd.name);
		if (!laid) {
			continue;
		}
		nd.x = laid.x;
		nd.y = laid.y;
		minX = Math.min(minX, laid.x - nd.w / 2);
		maxX = Math.max(maxX, laid.x + nd.w / 2);
		minY = Math.min(minY, laid.y - nd.h / 2);
		maxY = Math.max(maxY, laid.y + nd.h / 2);
	}
	if (minX === Number.POSITIVE_INFINITY) {
		return gridLayout(nodes, 30);
	}
	for (const nd of nodes) {
		nd.x -= minX;
		nd.y -= minY;
	}
	return { w: maxX - minX, h: maxY - minY };
}

// Shelf-packs cluster boxes into a roughly square area.
function packClusterBoxes(
	boxes: Cluster[],
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

// Lays every module out inside its project container, then packs the
// containers. Nodes must already carry w and h.
export function computeLayout(
	modules: ModuleNode[],
	edges: ModuleEdge[],
	dagre: DagreLike | undefined
): Cluster[] {
	const GUTTER = 64;
	const PAD = 20;
	const HEADER = 26;
	const clusters = buildClusters(modules);

	for (const c of clusters) {
		const header = c.key ? HEADER : 0;
		const size = layoutCluster(c.nodes, edges, dagre);
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
	packClusterBoxes(clusters, targetW, GUTTER);

	for (const box of clusters) {
		for (const nd of box.nodes) {
			nd.x += box.x + box.innerX;
			nd.y += box.y + box.innerY;
		}
	}
	return clusters;
}

// Maps each module to the modules that import it.
export function reverseIndex(edges: ModuleEdge[]): Record<string, string[]> {
	const idx: Record<string, string[]> = {};
	for (const e of edges) {
		if (!idx[e.to]) {
			idx[e.to] = [];
		}
		if (idx[e.to].indexOf(e.from) < 0) {
			idx[e.to].push(e.from);
		}
	}
	return idx;
}

// Every module that transitively imports this one, counted per project.
export function blastRadius(
	name: string,
	incoming: Record<string, string[]>,
	projectOf: (name: string) => string | undefined
): {
	byProject: Record<string, number>;
	names: string[];
	projectCount: number;
} {
	const seen: Record<string, boolean> = {};
	seen[name] = true;
	const queue = [name];
	const names: string[] = [];
	const byProject: Record<string, number> = {};
	let projectCount = 0;
	while (queue.length > 0) {
		const cur = queue.shift() as string;
		const sources = incoming[cur] || [];
		for (const src of sources) {
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
