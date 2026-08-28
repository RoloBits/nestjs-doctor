import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import { SummaryTab } from "../../src/report/ui/app/templates/summary.js";
import {
	codeDiagnostic,
	EMPTY_ARTIFACT,
	RICH_ARTIFACT,
} from "./report-artifact-fixture.js";

const render = (artifact: ReportArtifact) =>
	renderToStaticMarkup(<SummaryTab report={artifact} />);

describe("SummaryTab", () => {
	it("renders every card with the artifact's numbers", () => {
		const html = render(RICH_ARTIFACT);
		expect(html).toContain('<div class="ov-score-label">100 / 100</div>');
		expect(html).toContain('<div class="ov-card full-width">');
		expect(html).toContain("Excellent");
		expect(html).toContain("★★★★★");
		expect(html.match(/ov-cat-row/g)).toHaveLength(5);
		expect(html).toContain("Health Score");
		expect(html).toContain("Project Info");
		expect(html).toContain("Issues by Category");
		expect(html).toContain("Module Graph");
		expect(html).toContain("Analysis");
	});

	it("falls back to an em dash for unknown project facts", () => {
		const html = render(EMPTY_ARTIFACT);
		expect(html.match(/<span>—<\/span>/g)).toHaveLength(3);
	});

	it("counts root modules from unimported, AppModule, and bootstrap roots", () => {
		const artifact: ReportArtifact = {
			...EMPTY_ARTIFACT,
			graph: {
				...EMPTY_ARTIFACT.graph,
				modules: [
					{
						name: "AlphaModule",
						filePath: "a.ts",
						imports: [],
						providers: [],
						exports: [],
					},
					{
						name: "BetaModule",
						filePath: "b.ts",
						imports: [],
						providers: [],
						exports: [],
					},
					{
						name: "GammaModule",
						filePath: "c.ts",
						imports: [],
						providers: [],
						exports: [],
					},
				],
				edges: [
					{ from: "AlphaModule", to: "BetaModule" },
					{ from: "BetaModule", to: "GammaModule" },
				],
				bootstrapRoots: ["GammaModule"],
			},
		};
		const html = render(artifact);
		expect(html).toContain(
			'<span class="ov-stat-label">Root modules</span><span class="ov-stat-value">2</span>'
		);
	});

	it("counts only diagnostics kept off the score surface as not scored", () => {
		const artifact: ReportArtifact = {
			...EMPTY_ARTIFACT,
			summary: { ...EMPTY_ARTIFACT.summary, total: 2 },
			diagnostics: [
				codeDiagnostic({ surfaces: ["report"] }),
				codeDiagnostic({}),
			],
		};
		const html = render(artifact);
		expect(html).toContain("1 of 2 not scored");
		expect(render(EMPTY_ARTIFACT)).not.toContain("not scored");
	});
});
