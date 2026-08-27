import { describe, expect, it } from "vitest";
import type { SchemaRelation } from "../../model/schema";
import {
	computeOverviewLayout,
	nodeHeight,
	S_DEFAULT_MAX_COLS,
	type SchemaLayoutNode,
	visibleColCount,
} from "../schema-layout";

interface Node {
	h: number;
	name: string;
	w: number;
	x: number;
	y: number;
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
function buildSchema(): {
	nodes: SchemaLayoutNode[];
	relations: SchemaRelation[];
} {
	const nodes: SchemaLayoutNode[] = [];
	const relations: SchemaRelation[] = [];
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
					isNullable: false,
					propertyName: `rel${i}`,
					type: "many-to-one",
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

	it("keeps a single connected schema in one block", () => {
		const nodes: SchemaLayoutNode[] = [
			{ name: "a", x: 0, y: 0, w: 180, h: 52 },
			{ name: "b", x: 0, y: 0, w: 180, h: 52 },
			{ name: "c", x: 0, y: 0, w: 180, h: 52 },
		];
		const relations: SchemaRelation[] = [
			{
				fromEntity: "a",
				toEntity: "b",
				isNullable: false,
				propertyName: "bs",
				type: "one-to-many",
			},
			{
				fromEntity: "b",
				toEntity: "c",
				isNullable: false,
				propertyName: "cs",
				type: "many-to-one",
			},
		];
		computeOverviewLayout(relations, nodes);

		expect(findOverlap(nodes)).toBeNull();
	});
});

describe("schema node sizing", () => {
	const wide = { columns: new Array(24).fill({ type: "String" }) };

	it("caps visible columns unless all are shown", () => {
		expect(visibleColCount(wide, true, false)).toBe(S_DEFAULT_MAX_COLS);
		expect(visibleColCount(wide, true, true)).toBe(24);
	});

	it("sizes a table to every column only when all columns are shown", () => {
		// Header, one row per column, the "+N more" row only while capped.
		expect(nodeHeight(wide, true, false)).toBe(
			24 + S_DEFAULT_MAX_COLS * 16 + 16 + 8
		);
		expect(nodeHeight(wide, true, true)).toBe(24 + 24 * 16 + 8);
		expect(nodeHeight(wide, false, true)).toBe(52);
	});
});
