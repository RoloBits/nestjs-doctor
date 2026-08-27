import { describe, expect, it } from "vitest";
import type { TraceNode } from "../../model/timings";
import { classifyTraceRow, formatMs } from "../timings";

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

const trace: Record<string, TraceNode> = {
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

describe("classifyTraceRow", () => {
	it("marks a dep slower than its parent as reused", () => {
		const info = classifyTraceRow("tb", 1, "ta/tb", trace);
		expect(info?.reused).toBe(true);
		expect(info?.listed).toBe(false);
	});

	it("never marks a top-level row as reused", () => {
		expect(classifyTraceRow("ta", 0, "ta", trace)?.reused).toBe(false);
		expect(classifyTraceRow("tb", 0, "tb", trace)?.reused).toBe(false);
	});

	it("marks an ancestor repeat as a cycle that cannot expand", () => {
		const info = classifyTraceRow("ta", 1, "ta/tb/ta", trace);
		expect(info?.cycle).toBe(true);
		expect(info?.expandable).toBe(false);
	});

	it("lets a deep row expand when it has deps and does not cycle", () => {
		const traceWithDeepDeps: Record<string, TraceNode> = {
			...trace,
			tc: { name: "C", type: "provider", initTime: 1, deps: ["ta"] },
		};
		const info = classifyTraceRow("tc", 5, "a/b/c/d/e/tc", traceWithDeepDeps);
		expect(info?.expandable).toBe(true);
	});

	it("returns null for an id missing from the trace", () => {
		expect(classifyTraceRow("nope", 0, "nope", trace)).toBeNull();
	});
});
