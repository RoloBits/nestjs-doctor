import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../../src/common/result.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildHtmlReport } from "../../src/report/html-report.js";
import {
	buildBeacon,
	getTelemetryScript,
} from "../../src/report/ui/telemetry.js";
import { generatedIn } from "../../src/telemetry/environment.js";

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

	it("embeds the beacon with the configured key", () => {
		const script = getTelemetryScript("1.2.3");

		expect(script).toContain("window.__ndTrack =");
		expect(script).toContain('var VERSION = "1.2.3"');
	});

	it("reads nothing off the page that could carry project data", () => {
		const script = buildBeacon("phc_key", "1.2.3", "cli");

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
		const script = buildBeacon("phc_key", "1.2.3", "cli");

		expect(script).toContain("report_opened");
		expect(script).toContain("report_section_viewed");
		expect(script).toContain(
			'["summary", "diagnosis", "modules", "endpoints", "schema", "lab"]'
		);
		expect(script).toContain("report_action");
		expect(script).toContain("rule_lab_run");
		expect(script).toContain('"1.2.3"');
	});

	it("stamps where the report was generated", () => {
		expect(buildBeacon("phc_key", "1.2.3", "ci")).toContain(
			'var SOURCE = "ci"'
		);
		expect(buildBeacon("phc_key", "1.2.3", "cli")).toContain(
			'var SOURCE = "cli"'
		);
	});

	it("reads CI from the environment, ignoring its off spellings", () => {
		expect(generatedIn({ CI: "true" })).toBe("ci");
		expect(generatedIn({ CI: "1" })).toBe("ci");
		expect(generatedIn({ GITHUB_ACTIONS: "true" })).toBe("ci");
		// Set-but-off is how some shells and runners spell "not CI".
		expect(generatedIn({ CI: "false" })).toBe("cli");
		expect(generatedIn({ CI: "0" })).toBe("cli");
		expect(generatedIn({ CI: "" })).toBe("cli");
		expect(generatedIn({})).toBe("cli");
	});
});
