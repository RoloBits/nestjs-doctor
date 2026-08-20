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

describe("report scripts", () => {
	const scripts = getReportScripts(EMPTY);

	it("parses as JavaScript", () => {
		expect(() => new Function(scripts)).not.toThrow();
	});

	it("carries expandedElsewhere onto the drawn node", () => {
		expect(scripts).toContain("expandedElsewhere: dep.expandedElsewhere");
	});

	it("marks a node whose subtree is drawn elsewhere", () => {
		expect(scripts).toContain("n.expandedElsewhere");
		expect(scripts).toContain("\u21B1");
	});

	it("says so in the tooltip", () => {
		expect(scripts).toContain("node.expandedElsewhere");
		expect(scripts).toContain("Calls drawn at another call site");
	});

	it("appends the ms segment to a node's sub-label only when it carries timings", () => {
		expect(scripts).toContain("if (n.initTimings && n.initTimings.length > 0)");
		expect(scripts).toContain('sub += " \\u00b7 " + mgFormatMs');
	});

	it("adds a slowest-class line to the tooltip when timings are present", () => {
		expect(scripts).toContain("slowest\\u00a0class");
	});

	it("renders the Bootstrap timings section only when the graph has timings", () => {
		expect(scripts).toContain("if (graph.timingsAvailable)");
		expect(scripts).toContain('mgSection("Bootstrap timings"');
	});

	it("shows an explanatory empty state instead of a bare 0ms for an unmatched module", () => {
		expect(scripts).toContain("No bootstrap timing data");
	});

	it("opens the boot trace drawer from a timing row click", () => {
		expect(scripts).toContain('ev.target.closest(".mg-timing-link")');
		expect(scripts).toContain("function mgShowTrace");
	});

	it("guards trace lookups against inherited object keys", () => {
		expect(scripts).toContain(
			"Object.prototype.hasOwnProperty.call(graph.timingsTrace, id)"
		);
	});

	it("draws the class timings card on the canvas for the selected module", () => {
		expect(scripts).toContain("function mgDrawTimingsCard");
		expect(scripts).toContain("mgDrawTimingsCard();");
	});

	it("shows a boot headline badge only when timings are available", () => {
		expect(scripts).toContain("boot \\u2248");
		expect(scripts).toContain("if (graph.timingsAvailable) {");
	});
});
