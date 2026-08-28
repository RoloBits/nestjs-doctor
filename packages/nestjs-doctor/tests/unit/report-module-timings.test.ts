import { describe, expect, it } from "vitest";
import {
	axisStep,
	axisTicks,
	formatMs,
	type TraceMap,
	traceRowHtml,
} from "../../src/report/ui/app/lib/trace.js";

describe("traceRowHtml", () => {
	const trace: TraceMap = {
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
	};
	const row = (id: string, depth: number, path: string) =>
		traceRowHtml(trace, 100, id, depth, path);

	it("marks a dep slower than its parent as reused", () => {
		const html = row("tb", 1, "ta/tb");
		expect(html).toContain("mg-trace-reused");
		expect(html).toContain("already built for an earlier consumer");
	});

	it("never marks a top-level row as reused", () => {
		expect(row("ta", 0, "ta")).not.toContain("mg-trace-reused");
		expect(row("tb", 0, "tb")).not.toContain("mg-trace-reused");
	});

	it("labels every bar with its time inline", () => {
		expect(row("ta", 0, "ta")).toContain(
			`<span class="mg-trace-inline" style="left:0.90%">&lt;1ms</span>`
		);
		expect(row("tb", 0, "tb")).toContain("mg-trace-inline");
	});

	it("moves the label inside the bar when it nearly fills the track", () => {
		expect(traceRowHtml(trace, 67, "tb", 0, "tb")).toContain(
			"mg-trace-inline inside"
		);
	});
});

describe("axis ticks", () => {
	it("cuts at round steps below the maximum", () => {
		expect(axisStep(463)).toBe(100);
		expect(axisTicks(463)).toEqual([100, 200, 300, 400]);
	});

	it("scales down for fast boots", () => {
		expect(axisStep(1.9)).toBe(0.2);
		expect(axisTicks(1.9)[0]).toBe(0.2);
	});

	it("returns nothing without a positive maximum", () => {
		expect(axisTicks(0)).toEqual([]);
	});
});

describe("formatMs", () => {
	it("rounds to the nearest millisecond at 10ms and above", () => {
		expect(formatMs(210.4)).toBe("210ms");
		expect(formatMs(10)).toBe("10ms");
	});

	it("keeps one decimal between 1ms and 10ms", () => {
		expect(formatMs(4.55)).toBe("4.6ms");
		expect(formatMs(1)).toBe("1.0ms");
	});

	it("floors sub-millisecond timings to <1ms instead of rounding to 0", () => {
		expect(formatMs(0.4)).toBe("<1ms");
	});

	it("treats exactly 0ms the same as sub-millisecond, never printing 0ms", () => {
		expect(formatMs(0)).toBe("<1ms");
	});

	it("rounds 9.96ms up cleanly rather than printing 10.0ms", () => {
		expect(formatMs(9.96)).toBe("10ms");
	});
});
