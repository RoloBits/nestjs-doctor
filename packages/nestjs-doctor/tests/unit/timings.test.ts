import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	loadBootstrapTimings,
	parseBootstrapTimings,
} from "../../src/report/timings.js";

function moduleNode(label: string, internal = false) {
	return { id: label, label, metadata: { type: "module", internal } };
}

function classNode(
	label: string,
	parent: string,
	initTime: number | undefined,
	type = "provider"
) {
	return { id: label, label, parent, metadata: { type, initTime } };
}

function dump(nodes: Record<string, unknown>): string {
	return JSON.stringify({ nodes, edges: {}, entrypoints: {} });
}

describe("parseBootstrapTimings", () => {
	it("reads initTime off class nodes, keyed by their owning module's label, slowest first", () => {
		const { modules, warnings } = parseBootstrapTimings(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 4.5),
				c2: classNode("CatsController", "m1", 210.2, "controller"),
			})
		);

		expect(warnings).toEqual([]);
		expect(modules.get("CatsModule")).toEqual([
			{ name: "CatsController", type: "controller", initTime: 210.2 },
			{ name: "CatsService", type: "provider", initTime: 4.5 },
		]);
	});

	it("ignores nodes whose metadata.internal is true", () => {
		const { modules } = parseBootstrapTimings(
			dump({
				m1: moduleNode("InternalCoreModule", true),
				c1: classNode("ModuleRef", "m1", 1.2),
				m2: moduleNode("CatsModule"),
				c2: {
					...classNode("Reflector", "m2", 3),
					metadata: { type: "injectable", initTime: 3, internal: true },
				},
			})
		);

		expect(modules.size).toBe(0);
	});

	it("skips a class node with no numeric initTime rather than recording 0", () => {
		const { modules } = parseBootstrapTimings(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", undefined),
				c2: classNode("CatsController", "m1", 2),
			})
		);

		expect(modules.get("CatsModule")).toEqual([
			{ name: "CatsController", type: "provider", initTime: 2 },
		]);
	});

	it("returns an empty map and a warning for JSON that does not parse", () => {
		const { modules, warnings } = parseBootstrapTimings("not json {");

		expect(modules.size).toBe(0);
		expect(warnings.join(" ")).toContain("not valid JSON");
	});

	it("returns an empty map and a warning when the dump has no nodes object", () => {
		const { modules, warnings } = parseBootstrapTimings('{"edges":{}}');

		expect(modules.size).toBe(0);
		expect(warnings.join(" ")).toContain("SerializedGraph");
	});

	it("warns when a valid dump carries no timings at all", () => {
		const { warnings } = parseBootstrapTimings(
			dump({ m1: moduleNode("CatsModule") })
		);

		expect(warnings.join(" ")).toContain("snapshot: true");
	});
});

describe("loadBootstrapTimings", () => {
	const dir = mkdtempSync(join(tmpdir(), "nd-timings-"));

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("degrades to a warning when the file cannot be read", () => {
		const { timings, warnings } = loadBootstrapTimings(dir, "missing.json");

		expect(timings).toBeUndefined();
		expect(warnings.join(" ")).toContain("could not read");
	});

	it("resolves a relative path against the target and parses the dump", () => {
		writeFileSync(
			join(dir, "timings.json"),
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 12),
			})
		);

		const { timings, warnings } = loadBootstrapTimings(dir, "timings.json");

		expect(warnings).toEqual([]);
		expect(timings?.get("CatsModule")).toEqual([
			{ name: "CatsService", type: "provider", initTime: 12 },
		]);
	});
});
