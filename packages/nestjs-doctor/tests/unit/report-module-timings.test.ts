import { describe, expect, it } from "vitest";
import { formatMs, hookChipHtml } from "../../src/report/ui/app/lib/trace.js";

describe("hookChipHtml", () => {
	it("renders a chip with the hook label and duration", () => {
		const html = hookChipHtml([{ hook: "onModuleInit", ms: 120.4 }]);
		expect(html).toContain("mg-trace-hook");
		expect(html).toContain("120ms init");
	});

	it("marks per-instance totals with a count", () => {
		const html = hookChipHtml([{ hook: "onModuleInit", ms: 39, count: 2 }]);
		expect(html).toContain("×2");
		expect(html).toContain("across 2 instances");
	});

	it("renders nothing without hooks", () => {
		expect(hookChipHtml(undefined)).toBe("");
		expect(hookChipHtml([])).toBe("");
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
