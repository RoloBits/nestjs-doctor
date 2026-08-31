// @vitest-environment jsdom
import { expect, it } from "vitest";
import type { SerializedSchemaGraph } from "../../src/common/schema.js";
import { SchemaCanvas } from "../../src/report/ui/app/lib/schema-canvas.js";

const CANVAS_STUB: Record<string, unknown> = {
	canvas: { width: 800, height: 600 },
	measureText: () => ({ width: 40 }),
};

function stubCanvas(): HTMLCanvasElement {
	const ctx = new Proxy(CANVAS_STUB, {
		get: (target, key) =>
			key in target ? target[key as string] : () => undefined,
		set: () => true,
	});
	const canvas = document.createElement("canvas");
	// @ts-expect-error test stub
	canvas.getContext = () => ctx;
	document.body.appendChild(canvas);
	return canvas;
}

function schemaOf(): SerializedSchemaGraph {
	const entities: SerializedSchemaGraph["entities"] = [];
	for (let i = 0; i < 10; i++) {
		entities.push({
			columns: [],
			filePath: `e${i}.ts`,
			name: `e${i}`,
			relations: [],
			tableName: `e${i}`,
		});
	}
	return {
		entities,
		orm: "typeorm",
		relations: [
			{ fromEntity: "e0", fromField: "a", toEntity: "e1", type: "one-to-many" },
			{ fromEntity: "e2", fromField: "b", toEntity: "e3", type: "one-to-many" },
		] as SerializedSchemaGraph["relations"],
	};
}

function canvasOf(): SchemaCanvas {
	return new SchemaCanvas({
		callbacks: { onSelect: () => undefined, onZoom: () => undefined },
		canvas: stubCanvas(),
		relBadgeEl: document.createElement("div"),
		schema: schemaOf(),
		tooltipEl: document.createElement("div"),
	});
}

it("keeps earlier focused tables when another is selected", () => {
	const c = canvasOf();
	c.init();
	expect(c.focusedMode).toBe(true);
	c.selectFromSidebar("e0");
	expect(c.visibleEntities().sort()).toEqual(["e0", "e1"]);
	c.selectFromSidebar("e2");
	expect(c.visibleEntities().sort()).toEqual(["e0", "e1", "e2", "e3"]);
});

it("focusOneTable narrows back to the current selection", () => {
	const c = canvasOf();
	c.init();
	c.selectFromSidebar("e0");
	c.selectFromSidebar("e2");
	c.focusOneTable();
	expect(c.visibleEntities().sort()).toEqual(["e2", "e3"]);
});

it("clearing the selection empties the focused canvas", () => {
	const c = canvasOf();
	c.init();
	c.selectFromSidebar("e0");
	c.selectFromSidebar("e2");
	c.clearFocus();
	expect(c.visibleEntities()).toEqual([]);
});
