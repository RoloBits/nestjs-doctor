import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	loadBootstrapTimings,
	parseBootstrapTimings,
} from "../../src/report/timings.js";

function moduleNode(label: string, internal = false, global = false) {
	return { id: label, label, metadata: { type: "module", internal, global } };
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

function imports(importer: string, imported: string) {
	return edge(importer, imported, "module-to-module");
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

	it("keeps a hooks-only dump without a phase breakdown", () => {
		const { phases, warnings } = parseBootstrapTimings(
			JSON.stringify({
				edges: {},
				entrypoints: {},
				hookTimings: [
					{
						className: "CatsService",
						hook: "onModuleInit",
						ms: 12,
						startMs: 40,
					},
				],
				nodes: {
					c1: classNode("CatsService", "m1", 5),
					m1: moduleNode("CatsModule"),
				},
			})
		);
		expect(phases).toBeUndefined();
		expect(warnings).toEqual([]);
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
			module: "CatsModule",
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
			module: "CatsModule",
		});
		expect(trace.tc2.deps).toEqual(["t__proto__"]);
	});

	it("ignores nodes whose metadata.internal is true", () => {
		const { modules, trace } = parseBootstrapTimings(
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
		expect(trace).toEqual({});
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

	it("keeps classes of a repeated module name in the trace but attaches them to no module", () => {
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
		expect(trace.tc1.module).toBe("SharedModule");
		expect(trace.tc2.module).toBe("SharedModule");
		expect(warnings).toEqual([]);
	});

	it("records the parent module's label on every trace node", () => {
		const { trace } = parseBootstrapTimings(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 4.5),
			})
		);

		expect(trace.tc1).toEqual({
			deps: [],
			initTime: 4.5,
			module: "CatsModule",
			name: "CatsService",
			type: "provider",
		});
	});

	it("drops a class whose parent module is missing from the dump", () => {
		const { modules, trace } = parseBootstrapTimings(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("Orphan", "gone", 4.5),
			})
		);

		expect(trace).toEqual({});
		expect(modules.size).toBe(0);
	});

	it("names the one module that imports a class's module as via", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					mUsers: moduleNode("UsersModule"),
					mTypeOrm: moduleNode("TypeOrmModule"),
					c1: classNode("UserRepository", "mTypeOrm", 154.1),
				},
				{ e1: imports("mUsers", "mTypeOrm") }
			)
		);

		expect(trace.tc1.module).toBe("TypeOrmModule");
		expect(trace.tc1.via).toBe("UsersModule");
	});

	it("leaves via unset for a global module, even with one importer", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					mApp: moduleNode("AppModule"),
					mConfig: moduleNode("ConfigModule", false, true),
					c1: classNode("ConfigService", "mConfig", 2),
				},
				{ e1: imports("mApp", "mConfig") }
			)
		);

		expect(trace.tc1.module).toBe("ConfigModule");
		expect(trace.tc1.via).toBeUndefined();
	});

	it("leaves via unset for a module more than one module imports", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					mApp: moduleNode("AppModule"),
					mAdmin: moduleNode("AdminModule"),
					mCatalog: moduleNode("CatalogModule"),
					mUsers: moduleNode("UsersModule"),
					mCore: moduleNode("TypeOrmCoreModule"),
					c1: classNode("DataSource", "mCore", 154),
					c2: classNode("UsersService", "mUsers", 150),
				},
				{
					e1: imports("mUsers", "mCore"),
					e2: imports("mCatalog", "mCore"),
					e3: imports("mAdmin", "mCore"),
					e4: imports("mApp", "mUsers"),
					e5: imports("mAdmin", "mUsers"),
				}
			)
		);

		expect(trace.tc1.via).toBeUndefined();
		expect(trace.tc2.via).toBeUndefined();
	});

	it("counts only module nodes as importers, ignoring malformed and self edges", () => {
		const { trace } = parseBootstrapTimings(
			dump(
				{
					mUsers: moduleNode("UsersModule"),
					mInternal: moduleNode("InternalCoreModule", true),
					mTypeOrm: moduleNode("TypeOrmModule"),
					c1: classNode("UserRepository", "mTypeOrm", 154.1),
					c2: classNode("UsersService", "mUsers", 155),
				},
				{
					e1: imports("mUsers", "mTypeOrm"),
					e2: imports("mInternal", "mTypeOrm"),
					e3: imports("c2", "mTypeOrm"),
					e4: imports("missing", "mTypeOrm"),
					e5: { metadata: { type: "module-to-module" } },
					e6: {
						source: 7,
						target: "mTypeOrm",
						metadata: { type: "module-to-module" },
					},
					e7: imports("mTypeOrm", "mTypeOrm"),
				}
			)
		);

		expect(trace.tc1.via).toBe("UsersModule");
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

	it("derives the init boundary from the first bootstrap hook", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.initMs = 300;
		base.startupMs = 320;
		base.hookTimings = [
			{ className: "CatsService", hook: "onModuleInit", ms: 20, startMs: 150 },
			{
				className: "CatsService",
				hook: "onApplicationBootstrap",
				ms: 10,
				startMs: 256.5,
			},
		];
		const { phases, warnings } = parseBootstrapTimings(JSON.stringify(base));
		expect(phases?.moduleInitMs).toBe(256.5);
		expect(warnings).toEqual([]);
	});

	it("falls back to the last init hook's end when nothing runs at bootstrap", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.initMs = 300;
		base.startupMs = 320;
		base.hookTimings = [
			{ className: "CatsService", hook: "onModuleInit", ms: 20, startMs: 150 },
		];
		const { phases } = parseBootstrapTimings(JSON.stringify(base));
		expect(phases?.moduleInitMs).toBe(170);
	});

	it("keeps an explicit moduleInitMs over the derived one", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.moduleInitMs = 200;
		base.initMs = 300;
		base.hookTimings = [
			{
				className: "CatsService",
				hook: "onApplicationBootstrap",
				ms: 10,
				startMs: 256.5,
			},
		];
		const { phases } = parseBootstrapTimings(JSON.stringify(base));
		expect(phases?.moduleInitMs).toBe(200);
	});

	it("drops a derived boundary that would sit outside its neighbours", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.initMs = 300;
		base.hookTimings = [
			{
				className: "CatsService",
				hook: "onApplicationBootstrap",
				ms: 10,
				startMs: 50,
			},
		];
		const { phases, warnings } = parseBootstrapTimings(JSON.stringify(base));
		expect(phases?.moduleInitMs).toBeUndefined();
		expect(warnings).toEqual([]);
	});

	it("drops a derived boundary past startupMs", () => {
		const base = JSON.parse(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
			})
		);
		base.createMs = 100;
		base.startupMs = 320;
		base.hookTimings = [
			{
				className: "CatsService",
				hook: "onApplicationBootstrap",
				ms: 10,
				startMs: 350,
			},
		];
		const { phases, warnings } = parseBootstrapTimings(JSON.stringify(base));
		expect(phases?.createMs).toBe(100);
		expect(phases?.moduleInitMs).toBeUndefined();
		expect(warnings).toEqual([]);
	});

	it("leaves middleware out of the trace", () => {
		const { modules, trace } = parseBootstrapTimings(
			dump({
				m1: moduleNode("CatsModule"),
				c1: classNode("CatsService", "m1", 3),
				c2: classNode("LoggerMiddleware", "m1", 2, "middleware"),
			})
		);
		expect(trace.tc2).toBeUndefined();
		expect(trace.tc1).toBeDefined();
		expect(modules.get("CatsModule")).toHaveLength(1);
	});

	it("keeps per-instance hook entries separate and joins module-class hooks", () => {
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
			{ hook: "onModuleInit", ms: 20 },
			{ hook: "onModuleInit", ms: 19 },
		]);
		// The module node does not make its class-node label ambiguous.
		expect(hooksByClass.get("CatsModule")).toEqual([
			{ hook: "onModuleInit", ms: 800 },
		]);
		expect(warnings.join(" ")).not.toContain("malformed");
	});

	it("keeps each instance's own startMs", () => {
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
			{ hook: "onModuleInit", ms: 20, startMs: 305 },
			{ hook: "onModuleInit", ms: 19, startMs: 320 },
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

	it("returns timings when every module label repeats", () => {
		writeFileSync(
			join(dir, "repeated.json"),
			dump({
				m1: moduleNode("SharedModule"),
				m2: moduleNode("SharedModule"),
				c1: classNode("BillingService", "m1", 5),
				c2: classNode("AuthService", "m2", 3),
			})
		);

		const { timings, warnings } = loadBootstrapTimings(dir, "repeated.json");

		expect(warnings).toEqual([]);
		expect(timings?.byModule.size).toBe(0);
		expect(timings?.trace.tc1.module).toBe("SharedModule");
		expect(timings?.trace.tc2.module).toBe("SharedModule");
	});
});
