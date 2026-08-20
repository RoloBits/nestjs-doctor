import { describe, expect, it } from "vitest";
import {
	getReportScripts,
	type ReportScriptData,
} from "../../src/report/ui/scripts.js";

const EMPTY: ReportScriptData = {
	diagnosticsJson: "[]",
	elapsedMsJson: "0",
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
