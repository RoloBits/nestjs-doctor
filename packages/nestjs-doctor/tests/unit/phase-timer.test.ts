import { afterEach, describe, expect, it, vi } from "vitest";
import { startPhaseTimer } from "../../src/engine/phase-timer.js";

const COLLECT_LINE = /^\[timing] \/repo collect \d+ms \(\d+ms\)\n$/;
const PARSE_LINE = /^\[timing] \/repo parse \d+ms \(\d+ms\)\n$/;

function captureStderr() {
	const lines: string[] = [];
	const spy = vi
		.spyOn(process.stderr, "write")
		.mockImplementation((chunk: string | Uint8Array) => {
			lines.push(String(chunk));
			return true;
		});
	return { lines, spy };
}

afterEach(() => {
	vi.restoreAllMocks();
	process.env.NESTJS_DOCTOR_PHASE_TIMINGS = "";
});

describe("startPhaseTimer", () => {
	it("writes nothing when the variable is unset", () => {
		process.env.NESTJS_DOCTOR_PHASE_TIMINGS = "";
		const { lines } = captureStderr();
		const mark = startPhaseTimer("/repo");
		mark("collect");
		mark("parse");
		expect(lines).toEqual([]);
	});

	it("writes one line per phase, with the label and the running total", () => {
		process.env.NESTJS_DOCTOR_PHASE_TIMINGS = "1";
		const { lines } = captureStderr();
		const mark = startPhaseTimer("/repo");
		mark("collect");
		mark("parse");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(COLLECT_LINE);
		expect(lines[1]).toMatch(PARSE_LINE);
	});
});
