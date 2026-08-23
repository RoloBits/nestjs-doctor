import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../../src/common/result.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildHtmlReport } from "../../src/report/html-report.js";
import {
	buildBeacon,
	getTelemetryScript,
} from "../../src/report/ui/telemetry.js";

const emptyGraph = (): ModuleGraph => ({
	edges: new Map(),
	modules: new Map(),
	providerToModule: new Map(),
});

const emptyResult = (): DiagnoseResult =>
	({
		score: { value: 100, label: "Excellent" },
		diagnostics: [],
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: "prisma",
			framework: "express",
			fileCount: 1,
			moduleCount: 1,
		},
		summary: {
			total: 0,
			errors: 0,
			warnings: 0,
			info: 0,
			byCategory: {
				security: 0,
				performance: 0,
				correctness: 0,
				architecture: 0,
				schema: 0,
			},
		},
		ruleErrors: [],
		elapsedMs: 1,
	}) as DiagnoseResult;

describe("report telemetry", () => {
	it("embeds no beacon when telemetry is off", () => {
		const html = buildHtmlReport(emptyGraph(), emptyResult(), {
			telemetry: false,
		});

		// The tab handler's `window.__ndTrack?.()` call always ships and is
		// inert without the beacon that defines it.
		expect(html).not.toContain("posthog");
		expect(html).not.toContain("report_opened");
		expect(html).not.toContain("window.__ndTrack =");
	});

	it("sends no event before a key is configured", () => {
		// The published key is empty until a project exists, so the default
		// build stays silent rather than posting to a missing project.
		expect(getTelemetryScript("1.2.3")).toBe("");
	});

	it("reads nothing off the page that could carry project data", () => {
		const script = buildBeacon("phc_key", "1.2.3");

		expect(script).toContain("report://local");
		// The report's file:// URL holds the user's directory tree and project
		// name, and the page body holds paths and source text.
		expect(script).not.toContain("location");
		expect(script).not.toContain("document.title");
		expect(script).not.toContain("referrer");
		expect(script).not.toContain("innerText");
		expect(script).not.toContain("textContent");
	});

	it("posts only the two fixed events and a known section", () => {
		const script = buildBeacon("phc_key", "1.2.3");

		expect(script).toContain("report_opened");
		expect(script).toContain("report_section_viewed");
		expect(script).toContain(
			'["summary", "diagnosis", "modules", "endpoints", "schema", "lab"]'
		);
		expect(script).toContain('"1.2.3"');
	});
});
