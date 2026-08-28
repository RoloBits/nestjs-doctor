import { describe, expect, it } from "vitest";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { EMPTY_ARTIFACT_JSON as EMPTY } from "./report-artifact-fixture.js";

describe("report scripts", () => {
	const scripts = getReportScripts(EMPTY);

	it("parses as JavaScript", () => {
		expect(() => new Function(scripts)).not.toThrow();
	});

	it("carries expandedElsewhere onto the drawn node", () => {
		expect(scripts).toContain("expandedElsewhere: dep.expandedElsewhere");
	});

	it("marks a node whose subtree is drawn elsewhere", () => {
		expect(scripts).toContain("\u21B1");
	});

	it("says so in the tooltip", () => {
		expect(scripts).toContain("Calls drawn at another call site");
	});

	it("appends the ms segment to a node's sub-label only when it carries timings", () => {
		expect(scripts).toContain("if (n.initTimings && n.initTimings.length > 0)");
		expect(scripts).toContain('sub += " \\u00b7 " + mgFormatMs');
	});

	it("adds a slowest-class line to the tooltip when timings are present", () => {
		expect(scripts).toContain("slowest\\u00a0class");
	});

	it("syncs the timings drawer to the selected module", () => {
		expect(scripts).toContain("function mgSyncTraceDrawer");
		expect(scripts).toContain("function mgShowModuleTrace");
		expect(scripts).toContain("mgSyncTraceDrawer(n);");
		expect(scripts).toContain("mgSyncTraceDrawer(null);");
	});

	it("adds a trace button to the detail header when the module has timings", () => {
		expect(scripts).toContain('id: "detail-timings-btn"');
		expect(scripts).toContain('ev.target.closest("#detail-timings-btn")');
	});

	it("expands a trace row in place to reveal its dependencies", () => {
		expect(scripts).toContain('ev.target.closest(".mg-trace-expandable")');
		expect(scripts).toContain('row.insertAdjacentHTML("afterend", html)');
	});

	it("colors trace bars and badges by class type", () => {
		expect(scripts).toContain("TRACE_COLORS");
		expect(scripts).toContain("function traceColor");
	});

	it("marks a dep slower than its parent as reused with a hollow bar", () => {
		expect(scripts).toContain("node.initTime > parent.initTime");
		expect(scripts).toContain("mg-trace-reused-tag");
	});

	it("renders dock tooltips through the floating body-level layer", () => {
		expect(scripts).toContain('tip.id = "mg-float-tip"');
		expect(scripts).toContain('bind("mg-dock")');
		expect(scripts).toContain('bind("header-meta")');
	});

	it("guards trace lookups against inherited object keys", () => {
		expect(scripts).toContain("Object.hasOwn(trace, id)");
	});

	it("shows time-to-start when the dump has startupMs, else the slowest chain", () => {
		expect(scripts).toContain("time to start \\u2248");
		expect(scripts).toContain("boot \\u2248");
		expect(scripts).toContain("if (graph.startupMs) {");
	});

	it("jumps from the boot badge to the module owning the slowest chain", () => {
		expect(scripts).toContain("function mgJumpToSlowestBoot");
		expect(scripts).toContain('id="boot-badge"');
	});

	it("renders the lifecycle phase strip from the dump's markers", () => {
		expect(scripts).toContain("function mgRenderPhases");
		expect(scripts).toContain("mg-phase-strip");
		expect(scripts).toContain('"lifecycle hooks"');
	});

	it("shows per-class hook durations as chips on trace rows", () => {
		expect(scripts).toContain("function hookChipHtml");
		expect(scripts).toContain("hookChipHtml(node.hooks)");
		expect(scripts).toContain("RPT.hookChipHtml(n.hookTimings)");
	});
});
