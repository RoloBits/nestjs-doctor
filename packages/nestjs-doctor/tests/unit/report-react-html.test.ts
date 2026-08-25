import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../../src/common/result.js";
import { buildHtmlReport } from "../../src/report/html-report.js";
import { code, graph, reportProviders, result } from "./report-fixtures.js";

const DATA_TAG =
	/<script id="nd-report-data" type="application\/json">([\s\S]*?)<\/script>/;

const reactHtml = (scanResult: DiagnoseResult = result()): string =>
	buildHtmlReport(graph(), scanResult, {
		reportUi: true,
		providers: reportProviders,
	});

describe("react report html", () => {
	it("embeds the model as a parsable JSON tag and boots the bundle", () => {
		const html = reactHtml();
		const match = DATA_TAG.exec(html);
		expect(match).toBeTruthy();

		const model = JSON.parse(match![1]) as {
			project: { name: string };
			graph: { modules: unknown[] };
		};
		expect(model.project.name).toBe("app");
		expect(model.graph.modules).toHaveLength(2);

		expect(html).toContain('id="root" class="nd-report"');
		expect(html).toContain(
			'NDReport.mountReport(document.getElementById("root"))'
		);
	});

	it("parses payloads containing HTML comments and closing script tags", () => {
		const hostile = result();
		hostile.diagnostics.push(
			code({
				message: 'uses <!-- comments --> and "</script> in a string literal',
			})
		);
		const match = DATA_TAG.exec(reactHtml(hostile));
		expect(() => JSON.parse(match![1])).not.toThrow();
	});

	it("ships no external scripts on the react branch", () => {
		const html = reactHtml();
		expect(html).not.toContain("<script src=");
		expect(html).not.toContain("cdnjs.cloudflare.com");
		expect(html).not.toContain("esm.sh");
		expect(html).toContain("@layer nd-report");
	});

	it("keeps the telemetry beacon on both branches", () => {
		const react = reactHtml();
		expect(react).toContain("__ndTrack");

		const legacy = buildHtmlReport(graph(), result(), {});
		expect(legacy).toContain("cdnjs.cloudflare.com");
		expect(legacy).toContain("<script src=");
	});
});
