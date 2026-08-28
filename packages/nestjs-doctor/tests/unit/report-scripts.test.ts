import { describe, expect, it } from "vitest";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { EMPTY_ARTIFACT_JSON as EMPTY } from "./report-artifact-fixture.js";

describe("report scripts", () => {
	const scripts = getReportScripts(EMPTY);

	it("parses as JavaScript", () => {
		expect(() => new Function(scripts)).not.toThrow();
	});

	it("carries expandedElsewhere onto the drawn node", () => {
		expect(scripts).toContain("expandedElsewhere");
	});

	it("marks a node whose subtree is drawn elsewhere", () => {
		expect(scripts).toContain("\u21B1");
	});

	it("says so in the tooltip", () => {
		expect(scripts).toContain("Calls drawn at another call site");
	});

	it("appends the ms segment to a node's sub-label only when it carries timings", () => {
		expect(scripts).toContain("p \u00b7 ");
	});

	it("labels a module with its build and hook time when timings are present", () => {
		expect(scripts).toContain(" build`");
	});

	it("mounts the unified timeline in the dock, scoped to the selected module", () => {
		expect(scripts).toContain("boot-dock-body");
		expect(scripts).toContain("focusModule");
		expect(scripts).toContain("No boot timings in this report");
	});

	it("adds a trace button to the detail header when the module has timings", () => {
		expect(scripts).toContain("detail-timings-btn");
		expect(scripts).toContain("Open the Boot trace");
	});

	it("expands a dependency cascade under its class row", () => {
		expect(scripts).toContain("boot-expandable");
		expect(scripts).toContain("boot-cascade-row");
		expect(scripts).toContain("deduped");
	});

	it("colors trace bars and badges by class type", () => {
		expect(scripts).toContain("boot-hook-chip");
	});

	it("marks a dep slower than its parent as shared with a striped bar", () => {
		expect(scripts).toContain("boot-reused");
		expect(scripts).toContain("boot-reused-tag");
	});

	it("renders dock tooltips through the floating body-level layer", () => {
		expect(scripts).toContain("mg-float-tip");
		expect(scripts).toContain("mg-dock");
		expect(scripts).toContain("header-meta");
	});

	it("guards trace lookups against inherited object keys", () => {
		expect(scripts).toContain("hasOwn");
	});

	it("ships the boot tab button", () => {
		expect(scripts).toContain("tab-btn-boot");
	});

	it("renders the lifecycle phase lane from the dump's markers", () => {
		expect(scripts).toContain("boot-phase");
		expect(scripts).toContain("building modules");
		expect(scripts).toContain("lifecycle hooks");
	});

	it("shows per-class hook durations as chips or positioned spans", () => {
		expect(scripts).toContain("lifecycle hooks");
		expect(scripts).toContain("boot-hook-chip");
		expect(scripts).toContain("boot-hook-span");
	});
});
