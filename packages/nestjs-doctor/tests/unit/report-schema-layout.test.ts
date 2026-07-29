import { describe, expect, it } from "vitest";
import {
	getReportScripts,
	type ReportScriptData,
} from "../../src/report/ui/scripts.js";

const EMPTY: ReportScriptData = {
	diagnosticsJson: "[]",
	elapsedMsJson: "0",
	endpointsJson: '{"endpoints":[]}',
	examplesJson: "[]",
	fileSourcesJson: "{}",
	graphJson: '{"modules":[],"edges":[]}',
	projectJson: "{}",
	providersJson: "[]",
	schemaJson: "null",
	sourceLinesJson: "{}",
	summaryJson: "{}",
};

interface Node {
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
}

interface Relation {
	fromEntity: string;
	toEntity: string;
}

function edgeKey(from: string, to: string): string {
	return from < to ? `${from}|${to}` : `${to}|${from}`;
}

/** Fake dagre that ranks nodes along a diagonal, enough to exercise packing. */
const fakeDagre = {
	graphlib: {
		Graph: class {
			private readonly nodes = new Map<
				string,
				{ width: number; height: number; x: number; y: number }
			>();
			private order = 0;
			setGraph() {
				return this;
			}
			setDefaultEdgeLabel() {
				return this;
			}
			setNode(id: string, value: { width: number; height: number }) {
				this.order += 1;
				this.nodes.set(id, {
					...value,
					x: this.order * 400,
					y: this.order * 200,
				});
			}
			setEdge() {
				return this;
			}
			node(id: string) {
				return this.nodes.get(id);
			}
		},
	},
	layout() {
		// Positions are assigned in setNode.
	},
};

/**
 * Pulls the layout functions out of the emitted script and runs them against a
 * synthetic schema. The report has no DOM harness, so this executes the real
 * emitted source rather than a copy.
 */
function runOverviewLayout(
	relations: Relation[],
	nodes: Node[],
	dagreImpl: unknown
): void {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("function sComputeComponents");
	const end = scripts.indexOf("function sComputeStarLayout");
	if (start < 0 || end <= start) {
		throw new Error("layout functions not found in the emitted report script");
	}

	const factory = new Function(
		"schema",
		"sNodes",
		"sEdgeKey",
		"sRouteAllEdges",
		"dagre",
		`${scripts.slice(start, end)}\nreturn sComputeOverviewLayout;`
	);
	factory(
		{ relations },
		nodes,
		edgeKey,
		() => {
			// Edge routing is not under test.
		},
		dagreImpl
	)();
}

function overlaps(a: Node, b: Node): boolean {
	return (
		Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
		Math.abs(a.y - b.y) < (a.h + b.h) / 2
	);
}

function findOverlap(nodes: Node[]): string | null {
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			if (overlaps(nodes[i], nodes[j])) {
				return `${nodes[i].name} overlaps ${nodes[j].name}`;
			}
		}
	}
	return null;
}

/** Mirrors a real 34-entity schema: 18 components, 12 of them unrelated. */
function buildSchema(): { nodes: Node[]; relations: Relation[] } {
	const nodes: Node[] = [];
	const relations: Relation[] = [];
	const add = (name: string) => {
		nodes.push({ name, x: 0, y: 0, w: 180, h: 52 });
	};

	const componentSizes = [7, 6, 3, 2, 2, 2];
	componentSizes.forEach((size, index) => {
		for (let i = 0; i < size; i++) {
			add(`c${index}_${i}`);
			if (i > 0) {
				relations.push({
					fromEntity: `c${index}_0`,
					toEntity: `c${index}_${i}`,
				});
			}
		}
	});
	for (let i = 0; i < 12; i++) {
		add(`isolated${i}`);
	}
	return { nodes, relations };
}

describe("schema overview layout", () => {
	it("separates every table when dagre is available", () => {
		const { nodes, relations } = buildSchema();
		runOverviewLayout(relations, nodes, fakeDagre);

		expect(nodes).toHaveLength(34);
		expect(findOverlap(nodes)).toBeNull();
	});

	it("still separates every table with no dagre on the page", () => {
		const { nodes, relations } = buildSchema();
		runOverviewLayout(relations, nodes, undefined);

		expect(findOverlap(nodes)).toBeNull();
	});

	it("groups unrelated tables instead of stringing them out", () => {
		const { nodes, relations } = buildSchema();
		runOverviewLayout(relations, nodes, fakeDagre);

		const isolated = nodes.filter((n) => n.name.startsWith("isolated"));
		const rows = new Set(isolated.map((n) => n.y));
		const columns = new Set(isolated.map((n) => n.x));
		expect(rows.size).toBeGreaterThan(1);
		expect(columns.size).toBeGreaterThan(1);
	});

	it("sizes a table to every column only when all columns are shown", () => {
		const scripts = getReportScripts(EMPTY);
		const start = scripts.indexOf("var S_DEFAULT_MAX_COLS");
		const end = scripts.indexOf("function sCacheNodeLabels");
		if (start < 0 || end <= start) {
			throw new Error("sizing helpers not found in the emitted report script");
		}
		const factory = new Function(
			"sShowAllCols",
			"sShowCols",
			`${scripts.slice(start, end)}\nreturn { sNodeHeight: sNodeHeight, sVisibleColCount: sVisibleColCount };`
		);
		const wide = {
			entity: { columns: new Array(24).fill({ type: "String" }) },
		};

		const capped = factory(false, true);
		const all = factory(true, true);

		expect(capped.sVisibleColCount(wide, true)).toBe(7);
		expect(all.sVisibleColCount(wide, true)).toBe(24);
		// Header, one row per column, the "+N more" row only while capped.
		expect(capped.sNodeHeight(wide, true)).toBe(24 + 7 * 16 + 16 + 8);
		expect(all.sNodeHeight(wide, true)).toBe(24 + 24 * 16 + 8);
		expect(all.sNodeHeight(wide, false)).toBe(52);
	});

	it("separates module-shaped nodes, connected and not", () => {
		// Mirrors what the modules graph does: dagre per group, top down, with the
		// unconnected ones packed into a block.
		const scripts = getReportScripts(EMPTY);
		const start = scripts.indexOf("function sComputeComponents");
		const end = scripts.indexOf("function sComputeStarLayout");
		if (start < 0 || end <= start) {
			throw new Error(
				"layout functions not found in the emitted report script"
			);
		}
		const factory = new Function(
			"sEdgeKey",
			"dagre",
			`${scripts.slice(start, end)}\nreturn { sComputeComponents, sLayoutComponent, sLayoutIsolatedBlock, sPackBoxes };`
		);
		const api = factory(edgeKey, fakeDagre);

		const nodes: Node[] = [];
		const relations: Relation[] = [];
		for (let i = 0; i < 6; i++) {
			nodes.push({ name: `linked${i}`, x: 0, y: 0, w: 180, h: 36 });
			if (i > 0) {
				relations.push({ fromEntity: "linked0", toEntity: `linked${i}` });
			}
		}
		for (let i = 0; i < 9; i++) {
			nodes.push({ name: `alone${i}`, x: 0, y: 0, w: 180, h: 36 });
		}
		const edges = relations.map((r) => ({
			from: r.fromEntity,
			to: r.toEntity,
		}));

		const groups = api.sComputeComponents(nodes, edges, "from", "to");
		const boxes: {
			h: number;
			nodes: Node[];
			ox?: number;
			oy?: number;
			w: number;
		}[] = [];
		const alone: Node[] = [];
		for (const group of groups) {
			if (group.length === 1) {
				alone.push(group[0]);
				continue;
			}
			const size = api.sLayoutComponent(group, edges, "from", "to", "TB");
			boxes.push({ h: size.h, nodes: group, w: size.w });
		}
		api.sPackBoxes(boxes, 900, 90);
		let below = 0;
		for (const box of boxes) {
			below = Math.max(below, (box.oy ?? 0) + box.h);
		}
		const aloneSize = api.sLayoutIsolatedBlock(alone, 28);
		boxes.push({
			h: aloneSize.h,
			nodes: alone,
			ox: 0,
			oy: below + 90,
			w: aloneSize.w,
		});
		for (const box of boxes) {
			for (const node of box.nodes) {
				node.x += box.ox ?? 0;
				node.y += box.oy ?? 0;
			}
		}

		expect(alone).toHaveLength(9);
		expect(findOverlap(nodes)).toBeNull();
		// The unconnected block sits under everything it was packed beneath.
		const lowestLinked = Math.max(
			...nodes.filter((n) => n.name.startsWith("linked")).map((n) => n.y)
		);
		const highestAlone = Math.min(
			...nodes.filter((n) => n.name.startsWith("alone")).map((n) => n.y)
		);
		expect(highestAlone).toBeGreaterThan(lowestLinked);
	});

	it("groups by whatever edge shape it is handed", () => {
		// The module graph uses from/to, the schema uses fromEntity/toEntity.
		const scripts = getReportScripts(EMPTY);
		const start = scripts.indexOf("function sComputeComponents");
		const end = scripts.indexOf("function sComputeStarLayout");
		if (start < 0 || end <= start) {
			throw new Error(
				"layout functions not found in the emitted report script"
			);
		}
		const factory = new Function(
			"sEdgeKey",
			`${scripts.slice(start, end)}\nreturn sComputeComponents;`
		);
		const computeComponents = factory(edgeKey);
		const nodes = [
			{ name: "a", x: 0, y: 0, w: 180, h: 52 },
			{ name: "b", x: 0, y: 0, w: 180, h: 52 },
			{ name: "c", x: 0, y: 0, w: 180, h: 52 },
		];

		const grouped = computeComponents(
			nodes,
			[{ from: "a", to: "b" }],
			"from",
			"to"
		);

		expect(grouped).toHaveLength(2);
		expect(grouped.map((g: Node[]) => g.length).sort()).toEqual([1, 2]);
	});

	it("keeps a single connected schema in one block", () => {
		const nodes: Node[] = [
			{ name: "a", x: 0, y: 0, w: 180, h: 52 },
			{ name: "b", x: 0, y: 0, w: 180, h: 52 },
			{ name: "c", x: 0, y: 0, w: 180, h: 52 },
		];
		const relations: Relation[] = [
			{ fromEntity: "a", toEntity: "b" },
			{ fromEntity: "b", toEntity: "c" },
		];
		runOverviewLayout(relations, nodes, fakeDagre);

		expect(findOverlap(nodes)).toBeNull();
	});
});

describe("modules graph layout", () => {
	interface ModuleNode {
		h: number;
		name: string;
		project?: string;
		w: number;
		x: number;
		y: number;
	}

	function loadLayout(
		moduleNodes: ModuleNode[],
		edges: { from: string; to: string }[],
		activeProject = "all"
	) {
		const scripts = getReportScripts(EMPTY);
		const start = scripts.indexOf("function layoutModules()");
		const end = scripts.indexOf("/** Fits the given nodes");
		const helperStart = scripts.indexOf("function sComputeComponents");
		const helperEnd = scripts.indexOf("function sComputeStarLayout");
		if (start < 0 || end <= start || helperStart < 0) {
			throw new Error(
				"layout functions not found in the emitted report script"
			);
		}
		const factory = new Function(
			"nodes",
			"graph",
			"activeProject",
			"sEdgeKey",
			"dagre",
			`${scripts.slice(helperStart, helperEnd)}
			 let isolatedHeading = null;
			 function isNodeVisible(n) {
			   return activeProject === "all" || n.project === activeProject;
			 }
			 ${scripts.slice(start, end)}
			 return { layoutModules: layoutModules, heading: () => isolatedHeading };`
		);
		return factory(moduleNodes, { edges }, activeProject, edgeKey, fakeDagre);
	}

	function build(connected: number, alone: number): ModuleNode[] {
		const out: ModuleNode[] = [];
		for (let i = 0; i < connected; i++) {
			out.push({
				h: 36,
				name: `linked${i}`,
				project: "app",
				w: 180,
				x: 0,
				y: 0,
			});
		}
		for (let i = 0; i < alone; i++) {
			out.push({
				h: 36,
				name: `alone${i}`,
				project: "lib",
				w: 180,
				x: 0,
				y: 0,
			});
		}
		return out;
	}

	it("puts the unconnected modules below the connected ones", () => {
		const moduleNodes = build(4, 5);
		const edges = [
			{ from: "linked0", to: "linked1" },
			{ from: "linked1", to: "linked2" },
			{ from: "linked2", to: "linked3" },
		];
		const api = loadLayout(moduleNodes, edges);

		api.layoutModules();

		const linked = moduleNodes.filter((n) => n.name.startsWith("linked"));
		const alone = moduleNodes.filter((n) => n.name.startsWith("alone"));
		expect(findOverlap(moduleNodes)).toBeNull();
		expect(Math.min(...alone.map((n) => n.y))).toBeGreaterThan(
			Math.max(...linked.map((n) => n.y))
		);
		expect(api.heading()).toEqual(
			expect.objectContaining({ text: "5 modules with no import links" })
		);
	});

	it("says module once when only one has no links", () => {
		const moduleNodes = build(2, 1);
		const api = loadLayout(moduleNodes, [{ from: "linked0", to: "linked1" }]);

		api.layoutModules();

		expect(api.heading().text).toBe("1 module with no import links");
	});

	it("lays out a graph with no edges at all, without a heading", () => {
		const moduleNodes = build(0, 4);
		const api = loadLayout(moduleNodes, []);

		api.layoutModules();

		expect(api.heading()).toBeNull();
		expect(findOverlap(moduleNodes)).toBeNull();
		// Every module was positioned rather than left stacked on the origin.
		expect(new Set(moduleNodes.map((n) => `${n.x},${n.y}`)).size).toBe(4);
	});

	it("drops the heading while a project filter narrows the edges", () => {
		const moduleNodes = build(3, 2);
		const api = loadLayout(
			moduleNodes,
			[{ from: "linked0", to: "linked1" }],
			"lib"
		);

		api.layoutModules();

		expect(api.heading()).toBeNull();
	});

	it("does nothing when there are no modules", () => {
		const api = loadLayout([], []);

		expect(() => api.layoutModules()).not.toThrow();
	});
});
