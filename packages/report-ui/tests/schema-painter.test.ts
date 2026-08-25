import { describe, expect, it } from "vitest";
import { fixtureModel } from "../demo/fixture";
import {
	edgePath,
	placeEntities,
	SchemaPainter,
	schemaEdges,
} from "../src/canvas/schema-painter";
import type { ReportModel, SchemaRelation } from "../src/model";

const model = (): ReportModel => fixtureModel();

describe("placeEntities", () => {
	it("grids boxes by column count with header height", () => {
		const boxes = placeEntities(model().schema.entities);
		expect(boxes.map((b) => b.entity.name)).toEqual(["Order", "User"]);
		expect(boxes[1].h).toBe(26 + 2 * 18 + 8);
		expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
	});
});

describe("edgePath", () => {
	it("builds an elbow between matched entities and labels it", () => {
		const boxes = placeEntities(model().schema.entities);
		const edge = schemaEdges(model(), boxes)[0];
		expect(edge?.label).toBe("many-to-one");
		expect(edge?.path).toHaveLength(4);
	});

	it("drops relations whose ends are not laid out", () => {
		const orphan: SchemaRelation = {
			fromEntity: "Ghost",
			isNullable: false,
			propertyName: "x",
			toEntity: "User",
			type: "one-to-many",
		};
		const boxes = placeEntities(model().schema.entities);
		expect(edgePath(boxes, orphan)).toBeNull();
	});
});

describe("SchemaPainter", () => {
	it("places and selects in dead mode", () => {
		const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
		const painter = new SchemaPainter(canvas);
		painter.setModel(model());
		expect(painter.boxes).toHaveLength(2);
		painter.select("User");
		expect(painter.selected).toBe("User");
		painter.focusEntity("Order");
		expect(painter.selected).toBe("Order");

		const hit = painter.hitTest(painter.boxes[0].x + 5, painter.boxes[0].y + 5);
		expect(hit?.entity.name).toBe("Order");
	});

	it("ignores unknown entities on focus", () => {
		const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
		const painter = new SchemaPainter(canvas);
		painter.setModel(model());
		painter.focusEntity("Nope");
		expect(painter.selected).toBeNull();
	});
});
