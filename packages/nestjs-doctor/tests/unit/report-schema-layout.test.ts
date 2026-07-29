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
