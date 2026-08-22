import { describe, expect, it } from "vitest";
import { reportConflict } from "../../src/cli/setup.js";

describe("reportConflict", () => {
	it("allows --report on its own", () => {
		expect(reportConflict({})).toBeNull();
	});

	it("allows --report with --output, which names where the HTML goes", () => {
		expect(reportConflict({ json: false, score: false })).toBeNull();
	});

	it("rejects each flag that names a different output", () => {
		expect(reportConflict({ format: "json" })).toContain("--format");
		expect(reportConflict({ json: true })).toContain("--json");
		expect(reportConflict({ score: true })).toContain("--score");
	});

	it("names every conflicting flag at once", () => {
		const message = reportConflict({
			format: "sarif",
			json: true,
			score: true,
		});

		expect(message).toContain("--format, --json, --score");
	});

	it("does not fire on a flag left at its default", () => {
		expect(
			reportConflict({ format: "", json: false, score: false })
		).toBeNull();
	});
});
