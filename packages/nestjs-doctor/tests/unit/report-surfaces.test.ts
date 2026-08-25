import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildReportArtifact } from "../../src/report/artifact.js";
import { codeDiagnostic, emptyResult } from "./report-artifact-fixture.js";

const emptyGraph = (): ModuleGraph => ({
	edges: new Map(),
	modules: new Map(),
	providerToModule: new Map(),
});

const artifactWith = (diagnostics: Diagnostic[]) =>
	buildReportArtifact({
		moduleGraph: emptyGraph(),
		result: { ...emptyResult(), diagnostics },
		version: "0.0.0",
	});

describe("report artifact surfaces", () => {
	it("keeps a report-only finding, which the not-scored toggle reveals", () => {
		const artifact = artifactWith([
			codeDiagnostic({
				rule: "correctness/no-async-without-await",
				category: "correctness",
				message: "Async method has no await expression.",
				surfaces: ["cli"],
			}),
		]);

		expect(artifact.diagnostics).toHaveLength(1);
		expect(artifact.diagnostics[0].surfaces).toEqual(["cli"]);
	});

	it("drops a finding the cli surface never shows", () => {
		const artifact = artifactWith([
			codeDiagnostic({ rule: "correctness/hidden", surfaces: ["score"] }),
			codeDiagnostic({}),
		]);

		expect(artifact.diagnostics.map((d) => d.rule)).toEqual([
			"performance/no-unused-providers",
		]);
	});

	it("carries sourceLines inline on the findings they belong to", () => {
		const withSource = codeDiagnostic({
			rule: "correctness/with-source",
			sourceLines: [{ line: 3, text: "const x = 1;" }],
		});
		const withoutSource = codeDiagnostic({ rule: "correctness/bare" });
		const artifact = artifactWith([
			codeDiagnostic({ rule: "correctness/hidden", surfaces: ["score"] }),
			withSource,
			withoutSource,
		]);

		expect(artifact.diagnostics).toHaveLength(2);
		expect(artifact.diagnostics[0]).toMatchObject({
			rule: "correctness/with-source",
			sourceLines: [{ line: 3, text: "const x = 1;" }],
		});
		expect("sourceLines" in artifact.diagnostics[1]).toBe(false);
	});
});
