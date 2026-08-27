interface DependencyNode {
	className: string;
	conditional: boolean;
	dependencies?: DependencyNode[];
	expandedElsewhere?: boolean;
	filePath?: string;
	line?: number;
	methodName: string;
	order: number;
	totalMethods: number;
	type: string;
}

interface EndpointInput {
	controllerClass: string;
	dependencies: DependencyNode[];
	filePath?: string;
	handlerMethod: string;
	line?: number;
}

interface EndpointNode {
	className: string;
	conditional: boolean;
	expandedElsewhere?: boolean;
	filePath?: string;
	h: number;
	id: number;
	line?: number;
	methodName: string;
	order: number;
	totalMethods: number;
	type: string;
	w: number;
	x: number;
	y: number;
}

interface EndpointEdge {
	conditional: boolean;
	from: number;
	to: number;
}

interface DagreLike {
	graphlib: {
		Graph: new () => {
			node(name: number | string): { x: number; y: number } | undefined;
			setDefaultEdgeLabel(fn: () => object): void;
			setEdge(from: number | string, to: number | string): void;
			setGraph(options: object): void;
			setNode(
				name: number | string,
				size: { height: number; width: number }
			): void;
		};
	};
	layout(g: object): void;
}

// Flattens an endpoint's dependency tree into nodes and edges, the controller
// method as the root.
export function buildEndpointGraph(ep: EndpointInput): {
	edges: EndpointEdge[];
	nodes: EndpointNode[];
} {
	const nodes: EndpointNode[] = [];
	const edges: EndpointEdge[] = [];
	let nodeId = 0;

	const rootNode: EndpointNode = {
		id: nodeId++,
		className: ep.controllerClass,
		type: "controller",
		methodName: ep.handlerMethod,
		conditional: false,
		order: -1,
		totalMethods: 1,
		filePath: ep.filePath,
		line: ep.line,
		x: 0,
		y: 0,
		w: 180,
		h: 60,
	};
	nodes.push(rootNode);

	function walkDeps(parentNode: EndpointNode, deps: DependencyNode[]): void {
		for (const dep of deps) {
			const n: EndpointNode = {
				id: nodeId++,
				className: dep.className,
				type: dep.type,
				methodName: dep.methodName,
				conditional: dep.conditional,
				order: dep.order,
				totalMethods: dep.totalMethods,
				filePath: dep.filePath,
				line: dep.line,
				expandedElsewhere: dep.expandedElsewhere,
				x: 0,
				y: 0,
				w: 180,
				h: 60,
			};
			nodes.push(n);
			edges.push({
				from: parentNode.id,
				to: n.id,
				conditional: dep.conditional,
			});
			if (dep.dependencies && dep.dependencies.length > 0) {
				walkDeps(n, dep.dependencies);
			}
		}
	}

	walkDeps(rootNode, ep.dependencies);
	return { nodes, edges };
}

// Ranks the graph top-to-bottom with dagre, or stacks it vertically without.
export function layoutEndpointGraph(
	nodes: EndpointNode[],
	edges: EndpointEdge[],
	dagre: DagreLike | undefined
): void {
	if (nodes.length === 0) {
		return;
	}

	if (dagre !== undefined) {
		const g = new dagre.graphlib.Graph();
		g.setGraph({
			rankdir: "TB",
			nodesep: 40,
			ranksep: 80,
			marginx: 40,
			marginy: 40,
		});
		g.setDefaultEdgeLabel(() => ({}));

		for (const n of nodes) {
			g.setNode(n.id, { width: n.w, height: n.h });
		}
		for (const e of edges) {
			g.setEdge(e.from, e.to);
		}

		dagre.layout(g);

		for (const n of nodes) {
			const laid = g.node(n.id);
			if (laid) {
				n.x = laid.x;
				n.y = laid.y;
			}
		}
		return;
	}

	// Fallback: simple vertical layout
	for (let i = 0; i < nodes.length; i++) {
		nodes[i].x = 300;
		nodes[i].y = 60 + i * 100;
	}
}
