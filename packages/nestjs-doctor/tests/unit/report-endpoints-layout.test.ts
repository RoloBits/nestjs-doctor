import { describe, expect, it } from "vitest";
import {
	getReportScripts,
	type ReportScriptData,
} from "../../src/report/ui/scripts.js";

const EMPTY: ReportScriptData = {
	diagnosticsJson: "[]",
	elapsedMsJson: "0",
	endpointDiagnosticsJson: '{"perEndpoint":{},"perFile":{}}',
	endpointsJson: '{"endpoints":[]}',
	examplesJson: "[]",
	fileSourcesJson: "{}",
	graphJson: '{"modules":[],"edges":[]}',
	projectJson: "{}",
	providersJson: "[]",
	schemaJson: "null",
	sourceLinesJson: "{}",
	summaryJson: "{}",
};

const EP_BOX_W = 320;

interface Box {
	controllerClass: string;
	endpointIndices: number[];
	h: number;
	w: number;
	x: number;
	y: number;
}

interface Group {
	boxes: Box[];
	h: number;
	headerY: number;
	label: string;
	w: number;
}

/**
 * Pulls the pure box-sizing helpers out of the emitted script by name, the same
 * way report-schema-layout.test.ts extracts sNodeHeight/sVisibleColCount.
 */
function getSizingHelpers(): {
	epBoxHeight: (count: number) => number;
	epRowCount: (count: number) => number;
	EP_BOX_HEADER_H: number;
	EP_BOX_PAD_BOTTOM: number;
	EP_MAX_VISIBLE_ROWS: number;
	EP_ROW_H: number;
} {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("var EP_BOX_W");
	const end = scripts.indexOf("function epCacheOverviewLabels");
	if (start < 0 || end <= start) {
		throw new Error(
			"box sizing helpers not found in the emitted report script"
		);
	}
	const factory = new Function(
		`${scripts.slice(start, end)}\nreturn { epRowCount: epRowCount, epBoxHeight: epBoxHeight, EP_BOX_HEADER_H: EP_BOX_HEADER_H, EP_ROW_H: EP_ROW_H, EP_BOX_PAD_BOTTOM: EP_BOX_PAD_BOTTOM, EP_MAX_VISIBLE_ROWS: EP_MAX_VISIBLE_ROWS };`
	);
	return factory();
}

/**
 * Pulls the pure layout function out of the emitted script and runs it against
 * synthetic module/controller groups, the same extraction technique
 * report-schema-layout.test.ts uses for sComputeOverviewLayout.
 */
function runOverviewLayout(groups: Group[], boxWidth: number): void {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("// ep-overview-layout-start");
	const end = scripts.indexOf("// ep-overview-layout-end");
	if (start < 0 || end <= start) {
		throw new Error("layout functions not found in the emitted report script");
	}

	const factory = new Function(
		"groups",
		"boxWidth",
		`${scripts.slice(start, end)}\nepComputeOverviewLayout(groups, boxWidth);`
	);
	factory(groups, boxWidth);
}

function overlaps(a: Box, b: Box): boolean {
	return (
		Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
		Math.abs(a.y - b.y) < (a.h + b.h) / 2
	);
}

function findOverlap(boxes: Box[]): string | null {
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			if (overlaps(boxes[i], boxes[j])) {
				return `${boxes[i].controllerClass} overlaps ${boxes[j].controllerClass}`;
			}
		}
	}
	return null;
}

/** 30 endpoints across 8 controllers in 3 modules; one controller exceeds the 12-row cap. */
function buildFixture(epBoxHeight: (count: number) => number): {
	groups: Group[];
	totalEndpoints: number;
} {
	const controllerCounts: Array<{
		controller: string;
		count: number;
		module: string;
	}> = [
		{ controller: "UsersController", count: 15, module: "UsersModule" },
		{ controller: "ProfilesController", count: 3, module: "UsersModule" },
		{ controller: "SessionsController", count: 2, module: "UsersModule" },
		{ controller: "OrdersController", count: 4, module: "OrdersModule" },
		{ controller: "InvoicesController", count: 2, module: "OrdersModule" },
		{ controller: "HealthController", count: 1, module: "AdminModule" },
		{ controller: "MetricsController", count: 2, module: "AdminModule" },
		{ controller: "AuditController", count: 1, module: "AdminModule" },
	];

	let index = 0;
	const byModule = new Map<string, Box[]>();
	const moduleOrder: string[] = [];
	let totalEndpoints = 0;

	for (const entry of controllerCounts) {
		const endpointIndices: number[] = [];
		for (let i = 0; i < entry.count; i++) {
			endpointIndices.push(index++);
		}
		totalEndpoints += entry.count;

		if (!byModule.has(entry.module)) {
			byModule.set(entry.module, []);
			moduleOrder.push(entry.module);
		}
		byModule.get(entry.module)?.push({
			controllerClass: entry.controller,
			endpointIndices,
			h: epBoxHeight(entry.count),
			w: EP_BOX_W,
			x: 0,
			y: 0,
		});
	}

	const groups: Group[] = moduleOrder.map((label) => ({
		boxes: byModule.get(label) ?? [],
		h: 0,
		headerY: 0,
		label,
		w: 0,
	}));

	return { groups, totalEndpoints };
}

describe("endpoints overview box sizing", () => {
	it("caps visible rows at 12 and adds one +N more row only once past the cap", () => {
		const {
			epRowCount,
			epBoxHeight,
			EP_BOX_HEADER_H,
			EP_ROW_H,
			EP_BOX_PAD_BOTTOM,
			EP_MAX_VISIBLE_ROWS,
		} = getSizingHelpers();

		expect(EP_MAX_VISIBLE_ROWS).toBe(12);
		expect(epRowCount(30)).toBe(12);
		expect(epRowCount(5)).toBe(5);

		// Exactly at the cap: no hidden endpoints, no "+N more" row.
		const atCap = epBoxHeight(12);
		expect(atCap).toBe(EP_BOX_HEADER_H + 12 * EP_ROW_H + EP_BOX_PAD_BOTTOM);

		// One past the cap: a single extra row for "+1 more".
		const onePast = epBoxHeight(13);
		expect(onePast).toBe(atCap + EP_ROW_H);

		// Any further growth adds no more height — still just one "+N more" row.
		const wayPast = epBoxHeight(30);
		expect(wayPast).toBe(onePast);
	});
});

describe("endpoints overview layout", () => {
	it("packs boxes without overlap within or across module clusters", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		runOverviewLayout(groups, EP_BOX_W);

		const allBoxes = groups.flatMap((g) => g.boxes);
		expect(allBoxes).toHaveLength(8);
		expect(findOverlap(allBoxes)).toBeNull();
	});

	it("keeps every module's boxes in a Y-band that does not overlap another module's", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		runOverviewLayout(groups, EP_BOX_W);

		const bands = groups.map((g) => {
			const tops = g.boxes.map((b) => b.y - b.h / 2);
			const bottoms = g.boxes.map((b) => b.y + b.h / 2);
			return { min: Math.min(...tops), max: Math.max(...bottoms) };
		});

		for (let i = 0; i < bands.length; i++) {
			for (let j = i + 1; j < bands.length; j++) {
				const disjoint =
					bands[i].max <= bands[j].min || bands[j].max <= bands[i].min;
				expect(disjoint).toBe(true);
			}
		}
	});

	it("preserves which module each controller box belongs to", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		const before = groups.map((g) => ({
			label: g.label,
			controllers: g.boxes.map((b) => b.controllerClass),
		}));

		runOverviewLayout(groups, EP_BOX_W);

		const after = groups.map((g) => ({
			label: g.label,
			controllers: g.boxes.map((b) => b.controllerClass),
		}));
		expect(after).toEqual(before);
	});

	it("produces an identical layout across repeated runs", () => {
		const { epBoxHeight } = getSizingHelpers();
		const first = buildFixture(epBoxHeight).groups;
		const second = buildFixture(epBoxHeight).groups;

		runOverviewLayout(first, EP_BOX_W);
		runOverviewLayout(second, EP_BOX_W);

		const strip = (groups: Group[]) =>
			groups.map((g) => ({
				headerY: g.headerY,
				w: g.w,
				h: g.h,
				boxes: g.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
			}));

		expect(strip(first)).toEqual(strip(second));
	});
});
