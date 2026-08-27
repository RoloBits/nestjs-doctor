import { describe, expect, it } from "vitest";
import {
	computeOverviewLayout,
	nodeHeight,
	visibleColCount,
} from "../../src/report/ui/browser/schema-layout.js";

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
	it("separates every table", () => {
		const { nodes, relations } = buildSchema();
		computeOverviewLayout(relations, nodes);

		expect(nodes).toHaveLength(34);
		expect(findOverlap(nodes)).toBeNull();
	});

	it("groups unrelated tables instead of stringing them out", () => {
		const { nodes, relations } = buildSchema();
		computeOverviewLayout(relations, nodes);

		const isolated = nodes.filter((n) => n.name.startsWith("isolated"));
		const rows = new Set(isolated.map((n) => n.y));
		const columns = new Set(isolated.map((n) => n.x));
		expect(rows.size).toBeGreaterThan(1);
		expect(columns.size).toBeGreaterThan(1);
	});

	it("sizes a table to every column only when all columns are shown", () => {
		const wide = {
			entity: { columns: new Array(24).fill({ type: "String" }) },
		};

		expect(visibleColCount(wide, true, false)).toBe(7);
		expect(visibleColCount(wide, true, true)).toBe(24);
		// Header, one row per column, the "+N more" row only while capped.
		expect(nodeHeight(wide, true, false)).toBe(24 + 7 * 16 + 16 + 8);
		expect(nodeHeight(wide, true, true)).toBe(24 + 24 * 16 + 8);
		expect(nodeHeight(wide, false, true)).toBe(52);
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
		computeOverviewLayout(relations, nodes);

		expect(findOverlap(nodes)).toBeNull();
	});
});
