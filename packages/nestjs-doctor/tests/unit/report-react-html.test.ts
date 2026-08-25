import { describe, expect, it } from "vitest";
import { buildHtmlReport } from "../../src/report/html-report.js";
import { graph, reportProviders, result } from "./report-fixtures.js";

const reactHtml = (): string =>
	buildHtmlReport(graph(), result(), {
		reportUi: true,
		providers: reportProviders,
	});

const DATA_TAG =
	/<script id="nd-report-data" type="application\/json">([\s\S]*?)<\/script>/;

describe("react report html", () => {
	it("embeds the model as a parsable JSON tag and boots the bundle", () => {
		const html = reactHtml();
		const match = DATA_TAG.exec(html);
		expect(match).toBeTruthy();

		const model = JSON.parse(
			match![1].replaceAll("<\\/", "</").replaceAll("<\\!--", "<!--")
		) as { project: { name: string }; graph: { modules: unknown[] } };
		expect(model.project.name).toBe("app");
		expect(model.graph.modules).toHaveLength(2);

		expect(html).toContain('id="root" class="nd-report"');
		expect(html).toContain(
			'NDReport.mountReport(document.getElementById("root"))'
		);
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
