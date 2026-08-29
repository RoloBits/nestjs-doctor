import { describe, expect, it } from "vitest";
import type {
	SerializedModuleGraph,
	SerializedModuleNode,
} from "../../src/common/artifact.js";
import type { ClassTiming } from "../../src/common/timings.js";
import { parseBootstrapTimings } from "../../src/report/timings.js";
import {
	axisHtml,
	type BootWindow,
	buildBootTimeline,
	cascadeChildrenHtml,
	clampWindow,
	expandableIds,
	type ModuleTiming,
	moduleTimingLabel,
	moduleTimingLines,
	moduleTimings,
	pct,
	phaseLaneHtml,
	rowsHtml,
	slowestSpanId,
	spanMatches,
	UNATTRIBUTED_MODULE,
	windowAround,
	windowTicks,
	zoomWindow,
} from "../../src/report/ui/app/lib/boot-timeline.js";

function graph(
	overrides: Partial<SerializedModuleGraph> = {}
): SerializedModuleGraph {
	return {
		circularDepRecommendations: {},
		circularDeps: [],
		edges: [],
		modules: [],
		projects: [],
		...overrides,
	};
}

function traceNode(
	initTime: number,
	deps: string[] = [],
	hooks?: { hook: string; ms: number; startMs?: number }[],
	extra: { module?: string; name?: string; via?: string } = {}
) {
	return { deps, hooks, initTime, name: "", type: "provider", ...extra };
}

/** A graph module; a `project/Name` name also carries its project. */
function mod(
	name: string,
	initTimings: ClassTiming[] = []
): SerializedModuleNode {
	const slash = name.indexOf("/");
	return {
		controllers: [],
		exports: [],
		filePath: `${name}.ts`,
		imports: [],
		initTimings,
		name,
		...(slash > 0 ? { project: name.slice(0, slash) } : {}),
		providers: [],
	};
}

const WIN: BootWindow = { from: 0, to: 100 };

describe("buildBootTimeline", () => {
	it("starts a class after its slowest dependency that finished before it", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tb: traceNode(70),
					ta: traceNode(100, ["tb"]),
				},
			})
		);
		expect(t).not.toBeNull();
		expect(t?.byId.get("ta")).toMatchObject({
			end: 100,
			start: 70,
			waitedOn: "tb",
		});
	});

	it("skips a dependency that finished after its consumer and starts from boot", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tb: traceNode(70),
					td: traceNode(40, ["tb"]),
				},
			})
		);
		expect(t?.byId.get("td")).toMatchObject({ end: 40, start: 0 });
	});

	it("groups spans by module and sorts groups by their first construction", () => {
		const t = buildBootTimeline(
			graph({
				modules: [
					{
						controllers: [],
						exports: [],
						filePath: "a.ts",
						imports: [],
						initTimings: [
							{ id: "tc", initTime: 60, name: "CatsService", type: "provider" },
						],
						name: "CatsModule",
						providers: [],
					},
					{
						controllers: [],
						exports: [],
						filePath: "b.ts",
						imports: [],
						initTimings: [
							{ id: "td", initTime: 20, name: "DogsService", type: "provider" },
						],
						name: "DogsModule",
						providers: [],
					},
				],
				timingsTrace: {
					tc: { deps: [], initTime: 60, name: "CatsService", type: "provider" },
					td: { deps: [], initTime: 20, name: "DogsService", type: "provider" },
				},
			})
		);
		expect(t?.groups.map((g) => g.module)).toEqual([
			"DogsModule",
			"CatsModule",
		]);
		expect(t?.groups[0]?.spans[0]?.id).toBe("td");
	});

	it("falls back to an unattributed group for nodes without a module", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tx: { deps: [], initTime: 10, name: "X", type: "provider" },
				},
			})
		);
		expect(t?.groups).toHaveLength(1);
		expect(t?.groups[0]?.module).toBe(UNATTRIBUTED_MODULE);
		expect(t?.groups[0]?.external).toBeUndefined();
	});

	it("groups by the graph module when it claims a span, by the dump label when it does not", () => {
		const t = buildBootTimeline(
			graph({
				modules: [
					mod("api/UsersModule", [
						{
							id: "ta",
							initTime: 154.3,
							name: "UsersService",
							type: "provider",
						},
					]),
				],
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(154.3, [], undefined, {
						module: "UsersModule",
						name: "UsersService",
					}),
					tb: traceNode(154.1, [], undefined, {
						module: "TypeOrmModule",
						name: "UserRepository",
					}),
				},
			})
		);
		expect(t?.groups.map((g) => [g.module, g.external ?? false])).toEqual([
			["TypeOrmModule", true],
			["api/UsersModule", false],
		]);
	});

	it("tags a user module name repeated across projects as ambiguous, not external", () => {
		const t = buildBootTimeline(
			graph({
				modules: [mod("api/UsersModule"), mod("worker/UsersModule")],
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(154.3, [], undefined, {
						module: "UsersModule",
						name: "UsersService",
					}),
				},
			})
		);
		expect(t?.groups.map((g) => g.module)).toEqual(["UsersModule"]);
		expect(t?.groups[0]?.external).toBeUndefined();
		expect(t?.groups[0]?.ambiguous).toBe(true);
		expect(t?.byId.get("ta")?.ambiguous).toBe(true);
	});

	it("merges two dump instances of a user module name into one ambiguous group", () => {
		// The serializer attaches nothing to ConfigModule: its label repeats.
		const t = buildBootTimeline(
			graph({
				modules: [mod("ConfigModule")],
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(1.3, [], undefined, {
						module: "ConfigModule",
						name: "ConfigService",
					}),
					tb: traceNode(2.1, [], undefined, {
						module: "ConfigModule",
						name: "ConfigService",
					}),
				},
			})
		);
		expect(
			t?.groups.map((g) => [g.module, g.spans.length, g.ambiguous ?? false])
		).toEqual([["ConfigModule", 2, true]]);
		expect(t?.groups[0]?.external).toBeUndefined();
	});

	it("merges two dump modules with the same label into one external group", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(154.15, [], undefined, {
						module: "TypeOrmModule",
						name: "UserRepository",
						via: "UsersModule",
					}),
					tb: traceNode(154.12, [], undefined, {
						module: "TypeOrmModule",
						name: "CategoryRepository",
						via: "CatalogModule",
					}),
				},
			})
		);
		expect(t?.groups).toHaveLength(1);
		expect(t?.groups[0]?.module).toBe("TypeOrmModule");
		expect(t?.groups[0]?.external).toBe(true);
		expect(t?.groups[0]?.spans.map((s) => s.id)).toEqual(["tb", "ta"]);
		expect(t?.byId.get("ta")?.via).toBe("UsersModule");
		expect(t?.byId.get("tb")?.via).toBe("CatalogModule");
	});

	it("finds an external span by its third-party module label", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(154.1, [], undefined, {
						module: "TypeOrmModule",
						name: "UserRepository",
					}),
				},
			})
		);
		const span = t?.byId.get("ta");
		expect(span).toBeDefined();
		expect(spanMatches(span as NonNullable<typeof span>, "typeorm")).toBe(true);
	});

	it("extends maxMs to startupMs and to hook ends", () => {
		const t = buildBootTimeline(
			graph({
				startupMs: 900,
				timingsAvailable: true,
				timingsTrace: {
					ta: {
						deps: [],
						hooks: [{ hook: "onModuleInit", ms: 50, startMs: 800 }],
						initTime: 100,
						name: "A",
						type: "provider",
					},
				},
			})
		);
		expect(t?.maxMs).toBe(900);
	});

	it("uses hook ends for maxMs when they outlast startupMs", () => {
		const t = buildBootTimeline(
			graph({
				startupMs: 500,
				timingsAvailable: true,
				timingsTrace: {
					ta: {
						deps: [],
						hooks: [
							{
								hook: "onApplicationBootstrap",
								ms: 30,
								startMs: 560,
							},
						],
						initTime: 100,
						name: "A",
						type: "provider",
					},
				},
			})
		);
		expect(t?.maxMs).toBe(590);
	});

	it("builds phases from the dump markers", () => {
		const t = buildBootTimeline(
			graph({
				phases: { createMs: 100, initMs: 300, moduleInitMs: 250 },
				startupMs: 400,
				timingsAvailable: true,
				timingsTrace: { ta: traceNode(50) },
			})
		);
		expect(t?.phases.map((p) => [p.label, p.start, p.end])).toEqual([
			["create", 0, 100],
			["onModuleInit", 100, 250],
			["onApplicationBootstrap", 250, 300],
			["listen", 300, 400],
		]);
	});

	it("returns null when there are no timings", () => {
		expect(buildBootTimeline(graph())).toBeNull();
		expect(buildBootTimeline(graph({ timingsAvailable: true }))).toBeNull();
	});

	it("picks the slowest span for deep links", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tb: traceNode(70),
					ta: traceNode(100, ["tb"]),
				},
			})
		);
		expect(slowestSpanId(t!)).toBe("ta");
	});
});

describe("moduleTimings", () => {
	it("reports the slowest class's own build and the module's hook time", () => {
		const timings = moduleTimings(
			graph({
				modules: [
					{
						controllers: [],
						exports: [],
						filePath: "db.ts",
						imports: [],
						initTimings: [
							{
								id: "tb",
								initTime: 142,
								name: "DatabaseService",
								type: "provider",
							},
						],
						name: "DatabaseModule",
						providers: ["DatabaseService"],
					},
					{
						controllers: [],
						exports: [],
						filePath: "config.ts",
						imports: [],
						initTimings: [
							{
								id: "ta",
								initTime: 38,
								name: "ConfigService",
								type: "provider",
							},
						],
						name: "ConfigModule",
						providers: ["ConfigService"],
					},
				],
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(38),
					tb: {
						...traceNode(142, ["ta"]),
						hooks: [{ hook: "onModuleInit", ms: 63, startMs: 260 }],
					},
				},
			})
		);
		const db = timings.get("DatabaseModule");
		expect(db).toEqual({ buildMs: 104, hooks: [{ label: "init", ms: 63 }] });
		expect(moduleTimingLines(db as ModuleTiming)).toEqual([
			"104ms build",
			"63ms init",
		]);
		expect(moduleTimingLabel(db as ModuleTiming)).toBe(
			"104ms build · 63ms init"
		);
		expect(moduleTimingLabel(timings.get("ConfigModule") as ModuleTiming)).toBe(
			"38ms build"
		);
	});

	it("is empty without timings", () => {
		expect(moduleTimings(graph()).size).toBe(0);
	});

	it("reports an external group's own build time and its hooks", () => {
		const timings = moduleTimings(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					topt: traceNode(1.6, [], undefined, {
						module: "TypeOrmCoreModule",
						name: "TypeOrmModuleOptions",
					}),
					tds: traceNode(154.1, ["topt"], [{ hook: "onModuleInit", ms: 2 }], {
						module: "TypeOrmCoreModule",
						name: "DataSource",
					}),
				},
			})
		);
		const core = timings.get("TypeOrmCoreModule");
		expect(core?.buildMs).toBeCloseTo(152.5, 6);
		expect(core?.hooks).toEqual([{ label: "init", ms: 2 }]);
	});
});

describe("external modules from a real dump", () => {
	// A NestJS SerializedGraph dump for a shop API: user modules plus the
	// TypeORM and Bull modules they pull in, one of which is internal.
	function shopDump(): string {
		const module = (label: string, extra: Record<string, unknown> = {}) => ({
			label,
			metadata: { type: "module", ...extra },
		});
		const klass = (label: string, parent: string, initTime: number) => ({
			label,
			metadata: { initTime, type: "provider" },
			parent,
		});
		const m2m = (source: string, target: string) => ({
			metadata: { type: "module-to-module" },
			source,
			target,
		});
		const c2c = (source: string, target: string) => ({
			metadata: { type: "class-to-class" },
			source,
			target,
		});
		return JSON.stringify({
			createMs: 246.9,
			edges: {
				e01: m2m("mApp", "mUsers"),
				e02: m2m("mApp", "mCatalog"),
				e03: m2m("mApp", "mNotifications"),
				e04: m2m("mUsers", "mTypeOrm1"),
				e05: m2m("mCatalog", "mTypeOrm2"),
				e06: m2m("mUsers", "mTypeOrmCore"),
				e07: m2m("mCatalog", "mTypeOrmCore"),
				e08: m2m("mApp", "mBullGlobal"),
				e09: m2m("mUsers", "mBullGlobal"),
				e10: m2m("mNotifications", "mBullQueue"),
				e11: m2m("mUsers", "mInternal"),
				e12: c2c("cUsersService", "cUserRepository"),
				e13: c2c("cUserRepository", "cDataSource"),
				e14: c2c("cCategoryRepository", "cDataSource"),
				e15: c2c("cDataSource", "cTypeOrmModuleOptions"),
			},
			entrypoints: {},
			hookTimings: [
				{
					className: "BullRegistrar",
					hook: "onModuleInit",
					ms: 0.48,
					startMs: 250.7,
				},
			],
			initMs: 277.8,
			nodes: {
				mApp: module("AppModule"),
				mUsers: module("UsersModule"),
				mCatalog: module("CatalogModule"),
				mNotifications: module("NotificationsModule"),
				mTypeOrm1: module("TypeOrmModule", { dynamic: "forFeature" }),
				mTypeOrm2: module("TypeOrmModule", { dynamic: "forFeature" }),
				mTypeOrmCore: module("TypeOrmCoreModule", {
					dynamic: "forRoot",
					global: true,
				}),
				mBullGlobal: module("BullModule", {
					dynamic: "forRoot",
					global: true,
				}),
				mBullQueue: module("BullModule", { dynamic: "registerQueue" }),
				mInternal: module("InternalCoreModule", { internal: true }),
				cUsersService: klass("UsersService", "mUsers", 154.261_584),
				cUserRepository: klass("UserRepository", "mTypeOrm1", 154.147_917),
				cCategoryRepository: klass(
					"CategoryRepository",
					"mTypeOrm2",
					154.125_166
				),
				cDataSource: klass("DataSource", "mTypeOrmCore", 154.115_708),
				cTypeOrmModuleOptions: klass(
					"TypeOrmModuleOptions",
					"mTypeOrmCore",
					1.585_834
				),
				cBullRegistrar: klass("BullRegistrar", "mBullGlobal", 1.363_375),
				cBullQueue_notifications: klass(
					"BullQueue_notifications",
					"mBullQueue",
					33.928_042
				),
				cModuleRef: klass("ModuleRef", "mInternal", 0.2),
			},
			startupMs: 278.5,
		});
	}

	it("splits a real dump into the user module and the third-party modules behind it", () => {
		const parsed = parseBootstrapTimings(shopDump());
		expect(parsed.warnings).toEqual([]);

		const g = graph({
			modules: [
				mod("api/UsersModule", parsed.modules.get("UsersModule") ?? []),
			],
			phases: parsed.phases,
			projects: ["api"],
			startupMs: parsed.startupMs,
			timingsAvailable: true,
			timingsTrace: parsed.trace,
		});
		const t = buildBootTimeline(g);
		expect(t).not.toBeNull();
		expect(
			t?.groups.map((x) => [x.module, x.spans.length, x.external ?? false])
		).toEqual([
			["BullModule", 2, true],
			["TypeOrmCoreModule", 2, true],
			["TypeOrmModule", 2, true],
			["api/UsersModule", 1, false],
		]);
		expect(t?.byId.get("tcUserRepository")?.via).toBe("UsersModule");
		expect(t?.byId.get("tcDataSource")?.via).toBeUndefined();
		expect(t?.byId.get("tcModuleRef")).toBeUndefined();

		const timings = moduleTimings(g);
		expect(timings.get("TypeOrmCoreModule")?.buildMs).toBeCloseTo(152.53, 2);
		expect(timings.get("BullModule")?.hooks).toEqual([
			{ label: "init", ms: 0.48 },
		]);
	});
});

describe("window helpers", () => {
	it("clamps windows into the boot and floors their width", () => {
		expect(clampWindow({ from: -10, to: 500 }, 100)).toEqual({
			from: 0,
			to: 100,
		});
		const tiny = clampWindow({ from: 40, to: 40.0001 }, 100);
		expect(tiny.to - tiny.from).toBeCloseTo(100 / 5000, 8);
		expect(tiny.from).toBeGreaterThanOrEqual(0);
	});

	it("zooms around the anchor point, keeping its relative position", () => {
		const zoomed = zoomWindow({ from: 0, to: 100 }, 100, 0.5, 50);
		expect(zoomed.from).toBeCloseTo(25, 6);
		expect(zoomed.to).toBeCloseTo(75, 6);
	});

	it("zooming out past the boot clamps to the full boot", () => {
		expect(zoomWindow({ from: 20, to: 40 }, 100, 10, 30)).toEqual({
			from: 0,
			to: 100,
		});
	});

	it("frames a span with context for deep links", () => {
		const win = windowAround({ end: 500, start: 400 }, 1000);
		expect(win.from).toBeLessThan(400);
		expect(win.to).toBeGreaterThan(500);
	});

	it("maps time to percent inside the window", () => {
		expect(pct(50, { from: 0, to: 100 })).toBe(50);
		expect(pct(75, { from: 50, to: 100 })).toBe(50);
	});

	it("keeps ticks strictly inside the window", () => {
		expect(windowTicks({ from: 100, to: 200 })).toEqual([120, 140, 160, 180]);
		expect(windowTicks({ from: 0, to: 0 })).toEqual([]);
	});
});

describe("spanMatches", () => {
	const span = {
		deps: [],
		end: 1,
		id: "t1",
		module: "CatsModule",
		name: "CatsService",
		start: 1,
		type: "provider",
	};
	it("matches name, module, and type", () => {
		expect(spanMatches(span, "cats")).toBe(true);
		expect(spanMatches(span, "catsservice")).toBe(true);
		expect(spanMatches(span, "provider")).toBe(true);
		expect(spanMatches(span, "dogs")).toBe(false);
		expect(spanMatches(span, "  ")).toBe(true);
	});
});

const BAR_WITH_TIME = /class="boot-bar"[^>]*>30ms<\/span>/;
const BAR_FROM_BOOT = /class="boot-bar" style="left:0\.000%/;

const ROW_TIMELINE = buildBootTimeline(
	graph({
		modules: [
			{
				controllers: [],
				exports: [],
				filePath: "a.ts",
				imports: [],
				initTimings: [
					{
						id: "ta",
						initTime: 100,
						name: "CatsController",
						type: "controller",
					},
					{
						id: "tb",
						initTime: 70,
						name: "SchedulingService",
						type: "provider",
					},
				],
				name: "CatsModule",
				providers: [],
			},
		],
		timingsTrace: {
			tb: {
				deps: [],
				initTime: 70,
				name: "SchedulingService",
				type: "provider",
			},
			ta: {
				deps: ["tb"],
				hooks: [{ hook: "onModuleInit", ms: 5 }],
				initTime: 100,
				name: "CatsController",
				type: "controller",
			},
		},
	})
)!;

describe("rowsHtml", () => {
	const base = {
		expandedModules: new Set(["CatsModule"]),
		query: "",
		selectedId: null,
		win: WIN,
	};

	it("renders a group header with its class count and a group bar", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).toContain('data-group="CatsModule"');
		expect(html).toContain('class="boot-group-bar"');
		expect(html).toContain('class="boot-count">2</span>');
	});

	it("renders class bars at their absolute offsets with the time inside", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).toContain('data-id="ta"');
		expect(html).toMatch(BAR_WITH_TIME);
		expect(html).not.toContain("boot-ms");
	});

	it("colors each class row by type", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).toContain(
			'<span class="boot-dot" style="background:rgb(59,130,246)"></span>'
		);
	});

	it("indents class rows under their module with a chevron slot", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).toContain(
			'<span class="boot-indent"></span><span class="boot-caret">'
		);
		expect(html).toContain("<svg");
		expect(html).not.toContain("▸");
	});

	it("carries no tooltips anywhere in the rows", () => {
		expect(rowsHtml(ROW_TIMELINE, base)).not.toContain("data-tip");
	});

	it("draws a dotted guide where each phase hands over", () => {
		const t = buildBootTimeline(
			graph({
				phases: { createMs: 100, initMs: 300, moduleInitMs: 250 },
				startupMs: 400,
				timingsAvailable: true,
				timingsTrace: { ta: traceNode(50) },
			})
		)!;
		const html = rowsHtml(t, { ...base, win: { from: 0, to: 400 } });
		expect(html).toContain('<span class="boot-guides">');
		expect(html).toContain('class="boot-guide" style="left:25.000%');
		expect(html).toContain("left:62.500%");
		expect(html).toContain("left:75.000%");
		expect(html).not.toContain("left:100.000%");
		const zoomed = rowsHtml(t, { ...base, win: { from: 0, to: 200 } });
		expect(zoomed).toContain("left:50.000%");
		expect(zoomed).not.toContain("left:125.000%");
	});

	it("starts a bar at boot when nothing traced finished before it", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).not.toContain("boot-marker");
		expect(html).toMatch(BAR_FROM_BOOT);
	});

	it("dims classes that do not match the search", () => {
		const html = rowsHtml(ROW_TIMELINE, { ...base, query: "nothing" });
		expect(html).toContain("boot-filtered");
	});

	it("marks the selected row", () => {
		const html = rowsHtml(ROW_TIMELINE, { ...base, selectedId: "ta" });
		expect(html).toContain("boot-selected");
	});

	it("collapses groups that are not expanded", () => {
		const html = rowsHtml(ROW_TIMELINE, {
			...base,
			expandedModules: new Set(),
		});
		expect(html).toContain("boot-collapsed");
	});

	it("renders hook durations without offsets as chips, with offsets as spans", () => {
		const html = rowsHtml(ROW_TIMELINE, base);
		expect(html).toContain("boot-hook-chip");
		const withStart = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					ta: {
						deps: [],
						hooks: [
							{
								hook: "onModuleInit",
								ms: 5,
								startMs: 120,
							},
						],
						initTime: 100,
						name: "A",
						type: "provider",
					},
				},
			})
		)!;
		const html2 = rowsHtml(withStart, base);
		expect(html2).toContain('<span class="boot-hook-span" data-hook="0"');
		expect(html2).toContain("+5.0ms init</span>");
		expect(html2).not.toContain("boot-hook-chip");
	});
});

describe("external groups in rowsHtml", () => {
	const t = buildBootTimeline(
		graph({
			modules: [
				mod("CatsModule", [
					{ id: "tc", initTime: 200, name: "CatsService", type: "provider" },
				]),
			],
			timingsAvailable: true,
			timingsTrace: {
				tc: traceNode(200, [], undefined, { name: "CatsService" }),
				ta: traceNode(154.1, [], undefined, {
					module: "TypeOrmModule",
					name: "UserRepository",
				}),
			},
		})
	)!;
	const base = {
		expandedModules: new Set(["CatsModule", "TypeOrmModule"]),
		query: "",
		selectedId: null,
		win: { from: 0, to: 300 },
	};

	it("tags an external group right after its name and leaves user modules untagged", () => {
		const html = rowsHtml(t, base);
		const external = html.indexOf('data-group="TypeOrmModule"');
		const cats = html.indexOf('data-group="CatsModule"');
		expect(external).toBeGreaterThanOrEqual(0);
		expect(cats).toBeGreaterThan(external);
		expect(html.slice(external, cats)).toContain(
			'<span class="boot-name">TypeOrmModule</span><span class="boot-reused-tag">external</span>'
		);
		expect(html.slice(cats)).not.toContain("boot-reused-tag");
	});

	it("highlights an external group picked from the graph", () => {
		const html = rowsHtml(t, { ...base, selectedModule: "TypeOrmModule" });
		expect(html).toContain(
			'data-group="TypeOrmModule"><div class="boot-row boot-group-row boot-group-selected">'
		);
	});

	it("tags an ambiguous group when its name matches a graph module it could not join", () => {
		const a = buildBootTimeline(
			graph({
				modules: [mod("ConfigModule")],
				timingsAvailable: true,
				timingsTrace: {
					ta: traceNode(1.3, [], undefined, {
						module: "ConfigModule",
						name: "ConfigService",
					}),
				},
			})
		) as NonNullable<ReturnType<typeof buildBootTimeline>>;
		const html = rowsHtml(a, {
			...base,
			expandedModules: new Set(["ConfigModule"]),
		});
		expect(html).toContain('data-group="ConfigModule"');
		expect(html).toContain('boot-reused-tag">ambiguous</span>');
		expect(html).not.toContain(">external<");
	});
});

describe("cascadeChildrenHtml", () => {
	const t = ROW_TIMELINE;
	const base = {
		expandedModules: new Set(["CatsModule"]),
		query: "",
		selectedId: null,
		win: WIN,
	};

	it("lists deps under their consumer", () => {
		const html = cascadeChildrenHtml(t, "ta", 1, base);
		expect(html).toContain('data-id="tb"');
		expect(html).toContain("boot-cascade-row");
	});

	it("opens a cascade row's own dependencies when it is expanded", () => {
		const deep = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tc: traceNode(30, ["ta"]),
					tb: traceNode(70, ["tc"]),
					ta: traceNode(100, ["tb"]),
				},
			})
		)!;
		const closed = cascadeChildrenHtml(deep, "ta", 1, base);
		expect(closed).toContain('data-id="tb"');
		expect(closed).not.toContain('data-id="tc"');
		const open = cascadeChildrenHtml(deep, "ta", 1, {
			...base,
			expandedCascades: new Set(["tb", "tc"]),
		});
		expect(open).toContain('data-id="tb" data-depth="1"');
		expect(open).toContain('data-id="tc" data-depth="2"');
		expect(open).toContain("boot-expanded");
		// ta injects tb injects tc injects ta: the loop closes as a tag, not a row.
		expect(open).toContain('data-id="ta" data-depth="3"');
		expect(open).toContain(">circular</span>");
		expect(open).not.toContain('data-depth="4"');
	});

	it("lists every class with dependencies as expandable", () => {
		expect([...expandableIds(ROW_TIMELINE)]).toEqual(["ta"]);
	});

	it("marks a dep slower than its consumer as shared", () => {
		const slow = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tb: traceNode(120),
					ta: traceNode(100, ["tb"]),
				},
			})
		)!;
		const html = cascadeChildrenHtml(slow, "ta", 1, base);
		expect(html).toContain("boot-reused");
		expect(html).toContain('class="boot-reused-tag">shared</span>');
	});

	it("marks a dep that finished before its consumer as deduped", () => {
		const html = cascadeChildrenHtml(t, "ta", 1, base);
		expect(html).toContain(">deduped</span>");
	});
});

describe("lanes and axis", () => {
	it("renders the phase lane with names, times, shares, and zoom data", () => {
		const t = buildBootTimeline(
			graph({
				phases: { createMs: 100, initMs: 300, moduleInitMs: 250 },
				startupMs: 400,
				timingsAvailable: true,
				timingsTrace: { ta: traceNode(50) },
			})
		)!;
		const html = phaseLaneHtml(t);
		expect(html).toContain("boot-phase");
		expect(html).toContain('data-from="0" data-to="100"');
		expect(html).toContain("building modules");
		expect(html).not.toContain("data-tip");
	});

	it("renders the windowed axis with edge labels", () => {
		const html = axisHtml({ from: 0, to: 100 });
		expect(html).toContain("boot-axis-zero");
		expect(html).toContain("boot-axis-tick");
		expect(html).toContain("boot-axis-end");
	});
});
