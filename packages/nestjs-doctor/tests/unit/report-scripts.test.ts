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

	it("marks a node whose subtree was expanded earlier", () => {
		expect(scripts).toContain("n.expandedElsewhere");
		expect(scripts).toContain("SHOWN ABOVE");
	});

	it("says so in the tooltip", () => {
		expect(scripts).toContain("node.expandedElsewhere");
		expect(scripts).toContain("Calls drawn at an earlier call site");
	});
});
