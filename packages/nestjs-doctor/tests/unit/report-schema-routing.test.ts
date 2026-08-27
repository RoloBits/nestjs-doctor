import { describe, expect, it } from "vitest";
import { computeStarLayout } from "../../src/report/ui/browser/schema-layout.js";
import {
	buildGrids,
	channelRouteAll,
	corridorY,
	edgeKey,
	pointToSegmentDist,
	routeManhattan,
	segmentHitsBox,
	simplifyPath,
} from "../../src/report/ui/browser/schema-routing.js";

interface Node {
	_comp?: number;
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
}

function node(name: string, x: number, y: number, comp?: number): Node {
	return { name, x, y, w: 180, h: 52, _comp: comp };
}

function axisAligned(points: { x: number; y: number }[]): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		const sameX = Math.abs(points[i].x - points[i + 1].x) < 1;
		const sameY = Math.abs(points[i].y - points[i + 1].y) < 1;
		if (!(sameX || sameY)) {
			return false;
		}
	}
	return true;
}

function hitsBox(points: { x: number; y: number }[], box: Node): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		if (
			segmentHitsBox(
				points[i].x,
				points[i].y,
				points[i + 1].x,
				points[i + 1].y,
				box,
				0
			)
		) {
			return true;
		}
	}
	return false;
}

describe("edgeKey", () => {
	it("is symmetric", () => {
		expect(edgeKey("User", "Order")).toBe(edgeKey("Order", "User"));
	});
});

describe("pointToSegmentDist", () => {
	it("is zero on the segment and perpendicular off it", () => {
		expect(pointToSegmentDist(5, 0, 0, 0, 10, 0)).toBe(0);
		expect(pointToSegmentDist(5, 3, 0, 0, 10, 0)).toBe(3);
	});

	it("measures to the endpoint of a zero-length segment", () => {
		expect(pointToSegmentDist(3, 4, 0, 0, 0, 0)).toBe(5);
	});

	it("clamps to the nearest endpoint beyond the segment", () => {
		expect(pointToSegmentDist(14, 3, 0, 0, 10, 0)).toBe(5);
	});
});

describe("simplifyPath", () => {
	it("drops collinear points and keeps corners", () => {
		const path = simplifyPath([
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 5 },
			{ x: 10, y: 10 },
		]);
		expect(path).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
		]);
	});

	it("returns short paths untouched", () => {
		const two = [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		];
		expect(simplifyPath(two)).toEqual(two);
	});
});

describe("routeManhattan", () => {
	it("routes a clear pair with axis-aligned segments between their borders", () => {
		const a = node("a", 0, 0);
		const b = node("b", 500, 0);
		const path = routeManhattan([a, b], a, b);

		expect(path.length).toBeGreaterThanOrEqual(2);
		expect(axisAligned(path)).toBe(true);
		expect(path[0]).toMatchObject({ x: 90, y: 0 });
		expect(path.at(-1)).toMatchObject({ x: 410, y: 0 });
	});

	it("detours around a table sitting between the endpoints", () => {
		const a = node("a", 0, 0);
		const b = node("b", 600, 0);
		const wall = node("wall", 300, 0);
		const path = routeManhattan([a, b, wall], a, b);

		expect(axisAligned(path)).toBe(true);
		expect(hitsBox(path, wall)).toBe(false);
	});

	it("still returns an axis-aligned path when every detour is blocked", () => {
		const a = node("a", 0, 0);
		const b = node("b", 400, 0);
		const walls = [
			node("n", 200, -160),
			node("s", 200, 160),
			node("c", 200, 0),
		];
		const path = routeManhattan([a, b, ...walls], a, b);
		expect(axisAligned(path)).toBe(true);
	});
});

describe("buildGrids", () => {
	it("indexes columns per component and adds an outer gutter on each side", () => {
		const nodes = [
			node("a", 0, 0, 0),
			node("b", 0, 200, 0),
			node("c", 290, 0, 0),
			node("loose", 900, 900),
		];
		const grids = buildGrids(nodes);

		expect(Object.keys(grids)).toEqual(["0"]);
		expect(grids[0].cols).toHaveLength(2);
		expect(grids[0].gutters).toHaveLength(3);
		expect(grids[0].colOf).toEqual({ a: 0, b: 0, c: 1 });
	});

	it("skips isolated nodes marked with a negative component", () => {
		expect(buildGrids([node("iso", 0, 0, -1)])).toEqual({});
	});
});

describe("corridorY", () => {
	it("picks the gap between stacked boxes nearest the target", () => {
		const col = {
			left: 0,
			right: 180,
			boxes: [
				{ top: 0, bot: 100 },
				{ top: 200, bot: 300 },
			],
		};
		expect(corridorY([col], 160)).toBe(150);
	});

	it("returns the target when the columns are empty", () => {
		expect(corridorY([{ left: 0, right: 180, boxes: [] }], 42)).toBe(42);
	});
});

describe("channelRouteAll", () => {
	const portRowY = (n: Node) => n.y;
	const relPortNames = () => ({ fk: null, pk: null });

	function route(
		nodes: Node[],
		relations: { fromEntity: string; toEntity: string }[]
	) {
		const nodeMap: Record<string, Node> = {};
		for (const n of nodes) {
			nodeMap[n.name] = n;
		}
		return channelRouteAll(
			relations,
			nodes,
			nodeMap,
			buildGrids(nodes),
			portRowY,
			relPortNames
		);
	}

	it("routes a same-component pair through the gutter between their columns", () => {
		const a = node("a", 0, 0, 0);
		const b = node("b", 290, 0, 0);
		const { routes, keys } = route(
			[a, b],
			[{ fromEntity: "a", toEntity: "b" }]
		);

		expect(keys).toEqual([edgeKey("a", "b")]);
		const path = routes[keys[0]];
		expect(axisAligned(path)).toBe(true);
		expect(path[0]).toMatchObject({ x: 90, y: 0 });
		expect(path.at(-1)).toMatchObject({ x: 200, y: 0 });
	});

	it("collapses the two directions of a relation into one edge", () => {
		const a = node("a", 0, 0, 0);
		const b = node("b", 290, 0, 0);
		const { keys } = route(
			[a, b],
			[
				{ fromEntity: "a", toEntity: "b" },
				{ fromEntity: "b", toEntity: "a" },
			]
		);
		expect(keys).toHaveLength(1);
	});

	it("falls back to Manhattan routing across components", () => {
		const a = node("a", 0, 0, 0);
		const b = node("b", 600, 600, 1);
		const { routes, keys } = route(
			[a, b],
			[{ fromEntity: "a", toEntity: "b" }]
		);
		expect(keys).toHaveLength(1);
		expect(axisAligned(routes[keys[0]])).toBe(true);
	});
});

describe("computeStarLayout", () => {
	it("centres the selected table and rings three or more neighbours", () => {
		const nodes = [
			node("hub", 0, 0),
			node("n1", 0, 0),
			node("n2", 0, 0),
			node("n3", 0, 0),
		];
		computeStarLayout(nodes, "hub", 1200, 800);

		expect(nodes[0]).toMatchObject({ x: 600, y: 400 });
		for (const n of nodes.slice(1)) {
			expect(n.x).not.toBe(600);
		}
		const distinct = new Set(nodes.slice(1).map((n) => `${n.x}|${n.y}`));
		expect(distinct.size).toBe(3);
	});

	it("puts a single neighbour beside the hub in landscape", () => {
		const nodes = [node("hub", 0, 0), node("only", 0, 0)];
		computeStarLayout(nodes, "hub", 1200, 800);
		expect(nodes[1]).toMatchObject({ x: 600 + 180 + 100, y: 400 });
	});

	it("does nothing for an unknown centre", () => {
		const nodes = [node("a", 7, 9)];
		computeStarLayout(nodes, "missing", 1200, 800);
		expect(nodes[0]).toMatchObject({ x: 7, y: 9 });
	});
});
