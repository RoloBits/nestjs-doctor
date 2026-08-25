import { describe, expect, it } from "vitest";
import {
	easedFill,
	renderProgressLine,
	wipeLabel,
} from "../../src/cli/ui/animated-progress.js";

describe("easedFill", () => {
	it("approaches the target without overshooting", () => {
		let value = 0;
		for (let tick = 0; tick < 40 && value !== 354; tick++) {
			value = easedFill(value, 354);
			expect(value).toBeLessThanOrEqual(354);
		}
		expect(value).toBe(354);
	});

	it("snaps down immediately when the target shrinks", () => {
		expect(easedFill(300, 40)).toBe(40);
	});
});

describe("wipeLabel", () => {
	it("shows only the old label at the start", () => {
		expect(wipeLabel("Parsing files", "Running rules", 0)).toBe(
			"Parsing files"
		);
	});

	it("shows only the new label at the end", () => {
		expect(wipeLabel("Parsing files", "Running rules", 1)).toBe(
			"Running rules"
		);
	});

	it("blends the head of the new label with the tail of the old", () => {
		const mixed = wipeLabel("Parsing files", "Running rules", 0.5);
		expect(mixed.startsWith("Running")).toBe(true);
		expect(mixed).not.toBe("Running rules");
	});
});

describe("renderProgressLine", () => {
	it("renders the label alone when there is no count", () => {
		expect(
			renderProgressLine({
				displayed: 0,
				done: 0,
				label: "Collecting files",
				total: 0,
			})
		).toBe("Collecting files");
	});

	it("renders the eased fill with the displayed count", () => {
		const line = renderProgressLine({
			displayed: 100,
			done: 354,
			label: "Parsing files",
			total: 354,
		});
		expect(line).toContain("Parsing files");
		expect(line).toContain("100/354");
		expect(line).toContain("█");
		expect(line).toContain("░");
	});
});
