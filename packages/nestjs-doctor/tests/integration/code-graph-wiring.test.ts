import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
	decodeCodeGraph,
	encodeCodeGraph,
} from "../../src/common/code-graph-codec.js";
import type { AnalysisContext } from "../../src/engine/scanner.js";
import {
	buildAnalysisContext,
	buildResult,
	codeGraphFor,
	diagnose,
	resolveScanConfig,
	updateFile,
} from "../../src/engine/scanner.js";
import { buildReportArtifact } from "../../src/report/artifact.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/basic-app");

describe("the code graph on a real context", () => {
	let context: AnalysisContext;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		context = await buildAnalysisContext(FIXTURE, scanConfig);
	});

	it("builds once and hands back the same graph", () => {
		expect(codeGraphFor(context)).toBe(codeGraphFor(context));
	});

	it("covers every endpoint the scan found", () => {
		const graph = codeGraphFor(context);
		expect(graph.entries).toHaveLength(context.endpointGraph.endpoints.length);
		const ids = new Set(graph.nodes.map((node) => node.id));
		expect(graph.entries.every((entry) => ids.has(entry.node))).toBe(true);
	});

	it("leaves no edge pointing at a node it does not have", () => {
		const graph = codeGraphFor(context);
		const ids = new Set(graph.nodes.map((node) => node.id));
		const dangling = graph.edges.filter(
			(edge) => !(ids.has(edge.from) && ids.has(edge.to))
		);
		expect(dangling).toEqual([]);
	});

	it("drops the cached graph when a file changes", () => {
		const first = codeGraphFor(context);
		updateFile(context, context.files[0]);
		expect(codeGraphFor(context)).not.toBe(first);
	});
});

describe("the report artifact", () => {
	let context: AnalysisContext;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		context = await buildAnalysisContext(FIXTURE, scanConfig);
	});

	it("carries the graph when the caller passes one", async () => {
		const result = buildResult(context, await diagnose(context)).result;
		const artifact = buildReportArtifact({
			codeGraph: encodeCodeGraph(codeGraphFor(context)),
			moduleGraph: context.moduleGraph,
			result,
			version: "test",
		});
		expect(artifact.codeGraph).toBeDefined();
		const decoded = decodeCodeGraph(artifact.codeGraph!);
		expect(decoded.nodes).toEqual(codeGraphFor(context).nodes);
	});

	it("omits the graph entirely when the caller passes none", async () => {
		const result = buildResult(context, await diagnose(context)).result;
		const artifact = buildReportArtifact({
			moduleGraph: context.moduleGraph,
			result,
			version: "test",
		});
		expect(artifact.codeGraph).toBeUndefined();
		expect(JSON.stringify(artifact)).not.toContain("codeGraph");
	});
});
