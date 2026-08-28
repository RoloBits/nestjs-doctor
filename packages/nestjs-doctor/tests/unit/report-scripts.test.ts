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

	it("adds a slowest-class line to the tooltip when timings are present", () => {
		expect(scripts).toContain("slowest\u00a0class");
	});

	it("syncs the timings drawer to the selected module", () => {
		expect(scripts).toContain("Select a module to see its boot trace.");
		expect(scripts).toContain("No timing data for ");
	});

	it("adds a trace button to the detail header when the module has timings", () => {
		expect(scripts).toContain("detail-timings-btn");
		expect(scripts).toContain("Open the Boot trace");
	});

	it("expands a trace row in place to reveal its dependencies", () => {
		expect(scripts).toContain(".mg-trace-expandable");
		expect(scripts).toContain("insertAdjacentHTML");
	});

	it("colors trace bars and badges by class type", () => {
		expect(scripts).toContain("mg-trace-hook");
	});

	it("marks a dep slower than its parent as reused with a hollow bar", () => {
		expect(scripts).toContain("already built for an earlier consumer");
		expect(scripts).toContain("mg-trace-reused-tag");
	});

	it("renders dock tooltips through the floating body-level layer", () => {
		expect(scripts).toContain("mg-float-tip");
		expect(scripts).toContain("mg-dock");
		expect(scripts).toContain("header-meta");
	});

	it("guards trace lookups against inherited object keys", () => {
		expect(scripts).toContain("hasOwn");
	});

	it("shows time-to-start when the dump has startupMs, else the slowest chain", () => {
		expect(scripts).toContain("time to start \u2248");
		expect(scripts).toContain("boot \u2248");
	});

	it("jumps from the boot badge to the module owning the slowest chain", () => {
		expect(scripts).toContain("boot_trace_opened");
		expect(scripts).toContain("boot-badge");
	});

	it("renders the lifecycle phase strip from the dump's markers", () => {
		expect(scripts).toContain("mg-phase-strip");
		expect(scripts).toContain("building modules");
		expect(scripts).toContain("one timeline from launch to ready");
		expect(scripts).toContain("lifecycle hooks");
	});

	it("shows per-class hook durations as chips on trace rows", () => {
		expect(scripts).toContain("lifecycle hooks");
		expect(scripts).toContain("mg-trace-hook");
	});
});
