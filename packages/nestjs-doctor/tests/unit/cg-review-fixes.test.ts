import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CodeGraph, NodeId } from "../../src/common/code-graph.js";
import {
	decodeCodeGraph,
	encodeCodeGraph,
} from "../../src/common/code-graph-codec.js";
import { mergeCodeGraphs } from "../../src/engine/graph/code-graph.js";
import {
	buildAnalysisContext,
	codeGraphFor,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-review");

/** Shapes a review found, each of which produced a wrong node or a crash. */
describe("code graph review regressions", () => {
	let graph: CodeGraph;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		graph = codeGraphFor(await buildAnalysisContext(FIXTURE, scanConfig));
	});

	function edgesFrom(suffix: string) {
		const from = graph.nodes.filter((node) => node.id.endsWith(suffix));
		expect(from, `no unique node for ${suffix}`).toHaveLength(1);
		return graph.edges
			.filter((edge) => edge.from === from[0].id)
			.sort((a, b) => a.order - b.order);
	}

	function target(suffix: string): NodeId {
		const edges = edgesFrom(suffix);
		expect(edges).toHaveLength(1);
		return edges[0].to;
	}

	it("keeps two namespace-qualified external types apart", () => {
		// The binding in scope is the namespace, so keying the import lookup on the
		// stripped type name found nothing and both landed on one node.
		expect(target("/one.service.ts::OneService#run")).not.toBe(
			target("/two.service.ts::TwoService#run")
		);
	});

	it("sends super and this to different declarations when the names match", () => {
		// `class Ops extends BaseOps` where the base is also called Ops: a cache
		// keyed by class name alone collapsed the two lookups into one.
		expect(target("/child/ops.service.ts::Ops#label")).toContain("/base/");
		expect(target("/child/ops.service.ts::Ops#use")).toContain("/child/");
	});

	it("lets an explicit class decorator outrank a textual route match", () => {
		// `Audited` calls `store.Delete(key)`, which the wrapper scan reads as a
		// composed Delete() route.
		const resolver = graph.nodes.find((node) =>
			node.id.endsWith("/feed.resolver.ts::FeedResolver#items")
		);
		expect(resolver?.kind).toBe("resolver");
	});

	it("drops an entry whose handler was never indexed", () => {
		// An anonymous default-exported controller yields no node, and an entry
		// pointing at one crashed the codec.
		const ids = new Set(graph.nodes.map((node) => node.id));
		expect(graph.entries.every((entry) => ids.has(entry.node))).toBe(true);
		expect(graph.entries.some((entry) => entry.routePath === "/anon")).toBe(
			false
		);
	});

	it("survives a round trip with that entry dropped", () => {
		expect(
			decodeCodeGraph(JSON.parse(JSON.stringify(encodeCodeGraph(graph))))
		).toStrictEqual(graph);
	});
});

/** A shared method reached by two sub-projects that resolve it differently. */
describe("merging sub-project graphs", () => {
	const MONO = resolve(import.meta.dirname, "../fixtures/cg-mono");

	async function graphAt(sub: string): Promise<CodeGraph> {
		const target = `${MONO}/${sub}`;
		const scanConfig = await resolveScanConfig(target);
		return codeGraphFor(await buildAnalysisContext(target, scanConfig));
	}

	it("keeps one edge per call site when only one side resolves it", async () => {
		const parts = [
			await graphAt("apps/api"),
			await graphAt("apps/admin"),
			await graphAt("libs/shared"),
		];
		for (const order of [parts, [...parts].reverse()]) {
			const merged = mergeCodeGraphs(order);
			const seen = new Set<string>();
			for (const edge of merged.edges) {
				const key = `${edge.from}|${edge.order}`;
				expect(seen.has(key), `duplicate call site ${key}`).toBe(false);
				seen.add(key);
			}
			const ids = new Set(merged.nodes.map((node) => node.id));
			expect(merged.edges.every((edge) => ids.has(edge.to))).toBe(true);
		}
	});
});
