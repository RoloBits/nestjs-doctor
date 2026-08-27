import { describe, expect, it } from "vitest";
import { badge, treeRow } from "../../src/report/ui/browser/entry.js";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { EMPTY_ARTIFACT_JSON as EMPTY } from "./report-artifact-fixture.js";

/** Pulls mgFormatMs out of the emitted script and runs the real emitted source. */
function loadFormatMs(): (ms: number) => string {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("function mgFormatMs");
	const end = scripts.indexOf("function mgMeasureNode");
	if (start < 0 || end <= start) {
		throw new Error("mgFormatMs not found in the emitted report script");
	}
	const factory = new Function(`${scripts.slice(start, end)}
		return mgFormatMs;`);
	return factory() as (ms: number) => string;
}

/** Pulls the trace row builder out of the emitted script and runs it. */
function loadTraceRow(
	graph: unknown
): (id: string, depth: number, path: string) => string {
	const scripts = getReportScripts(EMPTY);
	const sliceOf = (start: string, end: string) => {
		const a = scripts.indexOf(start);
		const b = scripts.indexOf(end);
		if (a < 0 || b <= a) {
			throw new Error(`slice ${start} not found in the emitted report script`);
		}
		return scripts.slice(a, b);
	};
	const source =
		sliceOf("function mgFormatMs", "function mgMeasureNode") +
		sliceOf("function mgEsc", "var MG_INFO_ICON") +
		sliceOf("var mgTraceMax", "function mgShowModuleTrace");
	const factory = new Function(
		"graph",
		"RPT",
		`${source}
		mgTraceMax = 100;
		return mgTraceRowHtml;`
	);
	return factory(graph, { badge, treeRow }) as (
		id: string,
		depth: number,
		path: string
	) => string;
}

describe("mgTraceRowHtml", () => {
	const graph = {
		timingsTrace: {
			ta: {
				name: "BookingController",
				type: "controller",
				initTime: 0.9,
				deps: ["tb"],
			},
			tb: {
				name: "SchedulingService",
				type: "provider",
				initTime: 67,
				deps: [],
			},
		},
	};
	const row = loadTraceRow(graph);

	it("marks a dep slower than its parent as reused", () => {
		const html = row("tb", 1, "ta/tb");
		expect(html).toContain("mg-trace-reused");
		expect(html).toContain("already built for an earlier consumer");
	});

	it("never marks a top-level row as reused", () => {
		expect(row("ta", 0, "ta")).not.toContain("mg-trace-reused");
		expect(row("tb", 0, "tb")).not.toContain("mg-trace-reused");
	});
});

describe("mgFormatMs", () => {
	const format = loadFormatMs();

	it("rounds to the nearest millisecond at 10ms and above", () => {
		expect(format(210.4)).toBe("210ms");
		expect(format(10)).toBe("10ms");
	});

	it("keeps one decimal between 1ms and 10ms", () => {
		expect(format(4.55)).toBe("4.6ms");
		expect(format(1)).toBe("1.0ms");
	});

	it("floors sub-millisecond timings to <1ms instead of rounding to 0", () => {
		expect(format(0.4)).toBe("<1ms");
	});

	it("treats exactly 0ms the same as sub-millisecond, never printing 0ms", () => {
		expect(format(0)).toBe("<1ms");
	});

	it("rounds 9.96ms up cleanly rather than printing 10.0ms", () => {
		expect(format(9.96)).toBe("10ms");
	});
});
