import { describe, expect, it } from "vitest";
import type { SerializedModuleGraph } from "../../src/common/artifact.js";
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
	hooks?: { hook: string; ms: number; startMs?: number }[]
) {
	return { deps, hooks, initTime, name: "", type: "provider" };
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

	it("collects classes from repeated module names into an unattributed group", () => {
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

	it("maps dependencies to their consumers", () => {
		const t = buildBootTimeline(
			graph({
				timingsAvailable: true,
				timingsTrace: {
					tb: traceNode(70),
					ta: traceNode(100, ["tb"]),
				},
			})
		);
		expect(t?.consumersOf.get("tb")).toEqual(["ta"]);
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
