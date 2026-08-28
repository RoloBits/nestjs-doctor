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

function edge(source: string, target: string, type = "class-to-class") {
	return { source, target, metadata: { type } };
}

function dump(
	nodes: Record<string, unknown>,
	edges: Record<string, unknown> = {}
): string {
	return JSON.stringify({ nodes, edges, entrypoints: {} });
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
			{
				id: "tc2",
				name: "CatsController",
				type: "controller",
				initTime: 210.2,
			},
			{ id: "tc1", name: "CatsService", type: "provider", initTime: 4.5 },
		]);
	});

	it("extracts class-to-class edges as deps, sorted slowest first", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					m1: moduleNode("CatsModule"),
					c1: classNode("CatsController", "m1", 210, "controller"),
					c2: classNode("CatsService", "m1", 200),
					c3: classNode("CatsRepository", "m1", 190),
				},
				{
					e1: edge("c1", "c2"),
					e2: edge("c2", "c3"),
					e3: edge("m1", "c1", "module-to-module"),
				}
			)
		);

		expect(trace.tc1).toEqual({
			name: "CatsController",
			type: "controller",
			initTime: 210,
			deps: ["tc2"],
		});
		expect(trace.tc2.deps).toEqual(["tc3"]);
		expect(trace.tc3.deps).toEqual([]);
	});

	it("drops edges pointing at classes that were filtered out", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					m1: moduleNode("CatsModule"),
					c1: classNode("CatsService", "m1", 5),
					c2: classNode("NoTime", "m1", undefined),
				},
				{ e1: edge("c1", "c2"), e2: edge("c1", "missing") }
			)
		);

		expect(trace.tc1.deps).toEqual([]);
	});

	it('keeps a node whose id is "__proto__" reachable as a plain data key', () => {
		const { modules, trace } = parseBootstrapTimings(
			dump(
				{
					m1: moduleNode("CatsModule"),
					["__proto__"]: classNode("EvilService", "m1", 5),
					c2: classNode("GoodService", "m1", 10),
				},
				{ e1: edge("c2", "__proto__") }
			)
		);

		expect(modules.get("CatsModule")).toEqual([
			{ id: "tc2", name: "GoodService", type: "provider", initTime: 10 },
			{ id: "t__proto__", name: "EvilService", type: "provider", initTime: 5 },
		]);
		expect(trace.t__proto__).toEqual({
			name: "EvilService",
			type: "provider",
			initTime: 5,
			deps: [],
		});
		expect(trace.tc2.deps).toEqual(["t__proto__"]);
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
			{ id: "tc2", name: "CatsController", type: "provider", initTime: 2 },
		]);
	});

	it("attaches no classes to a module name that appears more than once in the dump", () => {
		const { modules, trace, warnings } = parseBootstrapTimings(
			dump({
				m1: moduleNode("SharedModule"),
				m2: moduleNode("SharedModule"),
				c1: classNode("BillingService", "m1", 5),
				c2: classNode("AuthService", "m2", 3),
				m3: moduleNode("CatsModule"),
				c3: classNode("CatsService", "m3", 2),
			})
		);

		expect(modules.get("SharedModule")).toBeUndefined();
		expect(modules.get("CatsModule")).toHaveLength(1);
		// The classes keep their own trace entries; only the module join is refused.
		expect(trace.tc1.name).toBe("BillingService");
		expect(warnings.join(" ")).toContain(
			"2 class timings belong to module names that appear more than once"
		);
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

	it("reads a top-level startupMs when it is a positive finite number", () => {
		const withField = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		withField.startupMs = 1234.5;

		const { startupMs } = parseBootstrapTimings(JSON.stringify(withField));
		expect(startupMs).toBe(1234.5);

		withField.startupMs = "fast";
		expect(
			parseBootstrapTimings(JSON.stringify(withField)).startupMs
		).toBeUndefined();
	});

	it("reads monotonic phase markers and drops them all when out of order", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.initMs = 150;
		base.startupMs = 180;

		const ok = parseBootstrapTimings(JSON.stringify(base));
		expect(ok.phases).toEqual({ createMs: 100, initMs: 150 });
		expect(ok.startupMs).toBe(180);

		base.initMs = 90;
		const bad = parseBootstrapTimings(JSON.stringify(base));
		expect(bad.phases).toBeUndefined();
		// A standalone-valid startupMs survives; only the breakdown is dropped.
		expect(bad.startupMs).toBe(180);
		expect(bad.warnings.join(" ")).toContain("out of order");
	});

	it("joins hook timings onto trace nodes only when the class name is unique", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
				c2: classNode("DogsService", "m1", 2),
				c3: classNode("DogsService", "m1", 1),
			})
		);
		base.hookTimings = [
			{ className: "CatsService", hook: "onModuleInit", ms: 120.4 },
			{ className: "DogsService", hook: "onModuleInit", ms: 5 },
			{ className: "Missing", hook: "onModuleInit", ms: 5 },
			{ className: "CatsService", hook: "onModuleInit", ms: 0 },
			{ notAClass: true },
		];

		const { trace, hooksByClass, warnings } = parseBootstrapTimings(
			JSON.stringify(base)
		);
		expect(trace.tc1.hooks).toEqual([{ hook: "onModuleInit", ms: 120.4 }]);
		expect(warnings.join(" ")).toContain("1 hookTimings entries are malformed");
		expect(trace.tc2.hooks).toBeUndefined();
		expect(hooksByClass.get("DogsService")).toBeUndefined();
		expect(warnings.join(" ")).toContain("2 hook timings name classes");
	});

	it("merges per-instance hook entries and joins module-class hooks", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				mc: classNode("CatsModule", "m1", 1),
				c1: classNode("TransientProv", "m1", 2),
			})
		);
		base.hookTimings = [
			{ className: "TransientProv", hook: "onModuleInit", ms: 20 },
			{ className: "TransientProv", hook: "onModuleInit", ms: 19 },
			{ className: "CatsModule", hook: "onModuleInit", ms: 800 },
			{ className: "TransientProv", hook: "onModuleInit", ms: 0 },
		];

		const { hooksByClass, warnings } = parseBootstrapTimings(
			JSON.stringify(base)
		);
		expect(hooksByClass.get("TransientProv")).toEqual([
			{ hook: "onModuleInit", ms: 39, count: 2 },
		]);
		// The module node does not make its class-node label ambiguous.
		expect(hooksByClass.get("CatsModule")).toEqual([
			{ hook: "onModuleInit", ms: 800 },
		]);
		expect(warnings.join(" ")).not.toContain("malformed");
	});

	it("keeps the first startMs when merging per-instance hook entries", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("TransientProv", "m1", 2),
			})
		);
		base.hookTimings = [
			{
				className: "TransientProv",
				hook: "onModuleInit",
				ms: 20,
				startMs: 305,
			},
			{
				className: "TransientProv",
				hook: "onModuleInit",
				ms: 19,
				startMs: 320,
			},
		];

		const { trace } = parseBootstrapTimings(JSON.stringify(base));
		expect(trace.tc1.hooks).toEqual([
			{ hook: "onModuleInit", ms: 39, count: 2, startMs: 305 },
		]);
	});

	it("drops a malformed startMs but keeps the hook entry", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.hookTimings = [
			{ className: "CatsService", hook: "onModuleInit", ms: 5, startMs: -1 },
			{ className: "CatsService", hook: "onApplicationBootstrap", ms: 6 },
		];

		const { trace, warnings } = parseBootstrapTimings(JSON.stringify(base));
		expect(trace.tc1.hooks).toEqual([
			{ hook: "onModuleInit", ms: 5 },
			{ hook: "onApplicationBootstrap", ms: 6 },
		]);
		expect(warnings).toEqual([]);
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
		expect(timings?.byModule.get("CatsModule")).toEqual([
			{ id: "tc1", name: "CatsService", type: "provider", initTime: 12 },
		]);
		expect(timings?.trace.tc1.deps).toEqual([]);
	});

	it("keeps a snippet-measured startupMs even when no class timings parsed", () => {
		writeFileSync(
			join(dir, "startup-only.json"),
			'{"nodes":{},"startupMs":4200}'
		);

		const { timings, warnings } = loadBootstrapTimings(
			dir,
			"startup-only.json"
		);

		expect(timings?.startupMs).toBe(4200);
		expect(timings?.byModule.size).toBe(0);
		expect(warnings.join(" ")).toContain("no class init times");
	});
});
