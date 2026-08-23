import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/typeorm-alias-app");

async function scan() {
	const scanConfig = await resolveScanConfig(FIXTURE);
	const context = await buildAnalysisContext(FIXTURE, scanConfig);
	return { context, output: await diagnose(context) };
}

describe("alias-imported base entities", () => {
	it("inherits the primary key through a path alias", async () => {
		const { output } = await scan();
		const flagged = new Set(
			output.diagnostics
				.filter((d) => d.rule === "schema/require-primary-key")
				.map((d) => ("entity" in d ? d.entity : ""))
		);
		expect(flagged.has("Order")).toBe(false);
		expect(flagged.has("Tag")).toBe(true);
	});

	it("inherits timestamps through a path alias", async () => {
		const { output } = await scan();
		const flagged = new Set(
			output.diagnostics
				.filter((d) => d.rule === "schema/require-timestamps")
				.map((d) => ("entity" in d ? d.entity : ""))
		);
		expect(flagged.has("Order")).toBe(false);
	});

	it("records the inherited columns on the schema graph", async () => {
		const { context } = await scan();
		const order = context.schemaGraph?.entities.get("Order");
		const columnNames = order?.columns.map((column) => column.name);
		expect(columnNames).toEqual(
			expect.arrayContaining(["total", "id", "createdAt", "updatedAt"])
		);
	});
});
