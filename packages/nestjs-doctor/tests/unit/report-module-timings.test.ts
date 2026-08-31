import { describe, expect, it } from "vitest";
import {
	formatMs,
	PALETTE,
	phaseParts,
} from "../../src/report/ui/app/lib/trace.js";

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

describe("phaseParts without a create marker", () => {
	it("merges construction into the init segment when only moduleInitMs is marked", () => {
		const parts = phaseParts({
			phases: { moduleInitMs: 170.1 },
			startupMs: 170.8,
		});
		expect(parts.length).toBeGreaterThanOrEqual(2);
		expect(parts.reduce((sum, p) => sum + p.ms, 0)).toBeCloseTo(170.8, 6);
		const head = parts[0];
		expect(head?.ms).toBeCloseTo(170.1, 6);
		expect(head?.label).not.toBe("create");
		expect(head?.gloss).toBe("build + init hooks");
		expect(parts.at(-1)?.label).toBe("bootstrap + listen");
	});

	it("renders one grey whole-boot segment when only startupMs is known", () => {
		for (const phases of [{}, undefined]) {
			const parts = phaseParts({ phases, startupMs: 170.8 });
			expect(parts).toHaveLength(1);
			expect(parts[0]).toMatchObject({
				gloss: "whole boot",
				ms: 170.8,
				rgb: PALETTE.grey,
			});
		}
	});

	it("merges everything before initMs when the earlier markers are missing", () => {
		const parts = phaseParts({ phases: { initMs: 84 }, startupMs: 92 });
		expect(parts.map((p) => [p.label, p.ms])).toEqual([
			["create + hooks", 84],
			["listen", 8],
		]);
	});
});
