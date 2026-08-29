// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SerializedModuleGraph } from "../../src/common/artifact.js";
import { hoverCardData } from "../../src/report/ui/app/lib/boot-hover.js";
import { placeHoverCard } from "../../src/report/ui/app/lib/boot-pointer.js";
import { buildBootTimeline } from "../../src/report/ui/app/lib/boot-timeline.js";
import { EMPTY_ARTIFACT } from "./report-artifact-fixture.js";

const TIMELINE = buildBootTimeline({
	...EMPTY_ARTIFACT.graph,
	modules: [
		{
			controllers: [],
			exports: [],
			filePath: "cats.ts",
			imports: [],
			initTimings: [
				{ id: "ta", initTime: 100, name: "CatsService", type: "provider" },
				{ id: "tb", initTime: 70, name: "SlowService", type: "provider" },
			],
			name: "CatsModule",
			providers: ["CatsService", "SlowService"],
		},
	],
	startupMs: 400,
	timingsAvailable: true,
	timingsTrace: {
		ta: {
			deps: ["tb"],
			hooks: [{ hook: "onModuleInit", ms: 20, startMs: 250 }],
			initTime: 100,
			name: "CatsService",
			type: "provider",
		},
		tb: { deps: [], initTime: 70, name: "SlowService", type: "provider" },
	},
} as SerializedModuleGraph);

// Classes from third-party modules the graph does not know about.
const EXTERNAL = buildBootTimeline({
	...EMPTY_ARTIFACT.graph,
	startupMs: 400,
	timingsAvailable: true,
	timingsTrace: {
		ta: {
			deps: [],
			initTime: 154,
			module: "TypeOrmModule",
			name: "UserRepository",
			type: "provider",
			via: "UsersModule",
		},
		tb: {
			deps: [],
			initTime: 33,
			module: "BullModule",
			name: "BullQueue_notifications",
			type: "provider",
		},
	},
} as SerializedModuleGraph);

// A user module name the graph could not join to one node.
const AMBIGUOUS = buildBootTimeline({
	...EMPTY_ARTIFACT.graph,
	modules: [
		{
			controllers: [],
			exports: [],
			filePath: "config.module.ts",
			imports: [],
			isGlobal: false,
			line: 1,
			name: "ConfigModule",
			providerTokens: [],
			providers: [],
		},
	],
	startupMs: 400,
	timingsAvailable: true,
	timingsTrace: {
		ta: {
			deps: [],
			initTime: 1.3,
			module: "ConfigModule",
			name: "ConfigService",
			type: "provider",
		},
	},
} as SerializedModuleGraph);

describe("hoverCardData", () => {
	it("marks a module name the graph could not join as ambiguous", () => {
		const t = AMBIGUOUS as NonNullable<typeof AMBIGUOUS>;
		expect(hoverCardData(t, t.byId.get("ta") as never, null).context).toBe(
			"in ConfigModule (ambiguous name) · provider"
		);
	});

	it("names an external module and the one module importing it", () => {
		const t = EXTERNAL as NonNullable<typeof EXTERNAL>;
		expect(hoverCardData(t, t.byId.get("ta") as never, null).context).toBe(
			"in TypeOrmModule · imported by UsersModule · provider"
		);
		expect(hoverCardData(t, t.byId.get("tb") as never, null).context).toBe(
			"in BullModule · provider"
		);
	});

	it("names the class and the dependency it waited on, with its own time", () => {
		const t = TIMELINE as NonNullable<typeof TIMELINE>;
		const data = hoverCardData(t, t.byId.get("ta") as never, null);
		expect(data.from.label).toBe("CatsService");
		expect(data.to?.label).toBe("SlowService");
		expect(data.context).toBe("in CatsModule · provider");
		expect(data.title).toBe("construction, after SlowService");
		expect(data.detail).toEqual({
			dim: "(7.5% of boot) · finished at 100ms",
			main: "30ms",
		});
	});

	it("describes a hook span by its kind and offset", () => {
		const t = TIMELINE as NonNullable<typeof TIMELINE>;
		const data = hoverCardData(t, t.byId.get("ta") as never, 0);
		expect(data.to?.label).toBe("init");
		expect(data.title).toBe("onModuleInit");
		expect(data.detail).toEqual({
			dim: "(5.0% of boot) · at 250ms",
			main: "20ms",
		});
	});
});

describe("placeHoverCard", () => {
	const box = (left: number, top: number, w: number, h: number) =>
		({
			bottom: top + h,
			height: h,
			left,
			right: left + w,
			top,
			width: w,
		}) as DOMRect;

	it("sits diagonally up-right of the pointer, tethered to its bottom-left corner", () => {
		const card = document.createElement("div");
		const tether = document.createElement("div");
		const bar = document.createElement("span");
		Object.defineProperty(card, "offsetWidth", { value: 200 });
		Object.defineProperty(card, "offsetHeight", { value: 80 });
		bar.getBoundingClientRect = () => box(100, 300, 400, 16);
		placeHoverCard(card, tether, bar, 150, 308);
		expect(card.style.left).toBe("176px");
		expect(card.style.top).toBe("202px");
		expect(tether.style.left).toBe("150px");
		expect(tether.style.top).toBe("308px");
		expect(tether.style.transform).toBe("rotate(-45deg)");
	});

	it("mirrors to the left when the right edge has no room", () => {
		const card = document.createElement("div");
		const tether = document.createElement("div");
		const bar = document.createElement("span");
		Object.defineProperty(card, "offsetWidth", { value: 200 });
		Object.defineProperty(card, "offsetHeight", { value: 80 });
		bar.getBoundingClientRect = () => box(100, 300, 400, 16);
		const x = window.innerWidth - 40;
		placeHoverCard(card, tether, bar, x, 308);
		expect(card.style.left).toBe(`${x - 26 - 200}px`);
		expect(tether.style.transform).toBe("rotate(-135deg)");
	});
});
