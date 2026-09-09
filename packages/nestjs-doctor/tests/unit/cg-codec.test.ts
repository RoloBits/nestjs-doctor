import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CodeGraph } from "../../src/common/code-graph.js";
import type { EncodedCodeGraph } from "../../src/common/code-graph-codec.js";
import {
	decodeCodeGraph,
	encodeCodeGraph,
} from "../../src/common/code-graph-codec.js";
import { mergeCodeGraphs } from "../../src/engine/graph/code-graph.js";
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

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-codec");
const MONO = resolve(import.meta.dirname, "../fixtures/cg-mono");

type Bag = Record<string, unknown>;

async function contextAt(dir: string): Promise<AnalysisContext> {
	return buildAnalysisContext(dir, await resolveScanConfig(dir));
}

async function graphAt(dir: string): Promise<CodeGraph> {
	return codeGraphFor(await contextAt(dir));
}

/** Every key of `original`, compared one at a time so a loss names itself. */
function expectSameFields(original: object, decoded: object, where: string) {
	const before = original as Bag;
	const after = decoded as Bag;
	expect(Object.keys(after).sort()).toStrictEqual(Object.keys(before).sort());
	for (const key of Object.keys(before)) {
		expect({ [`${where}.${key}`]: after[key] }).toStrictEqual({
			[`${where}.${key}`]: before[key],
		});
	}
}

function danglingEdges(graph: CodeGraph): string[] {
	const ids = new Set(graph.nodes.map((node) => node.id));
	return graph.edges
		.filter((edge) => !(ids.has(edge.from) && ids.has(edge.to)))
		.map((edge) => `${edge.from} -> ${edge.to}`);
}

describe("code graph codec fidelity", () => {
	let graph: CodeGraph;
	let encoded: EncodedCodeGraph;

	beforeAll(async () => {
		graph = await graphAt(FIXTURE);
		encoded = encodeCodeGraph(graph);
	}, 60_000);

	it("exercises every optional field the graph can carry", () => {
		const items = graph.nodes.flatMap((node) => node.body);
		const reasons = new Set(
			graph.nodes.map((node) => node.unresolved).filter(Boolean)
		);
		expect([...reasons].sort()).toStrictEqual([
			"external-package",
			"interface-token",
			"method-not-found",
			"receiver-unknown",
		]);
		expect(graph.nodes.some((node) => node.isStatic)).toBe(true);
		expect(graph.nodes.some((node) => node.member !== undefined)).toBe(true);
		expect(graph.nodes.some((node) => node.className === "")).toBe(true);
		expect([...new Set(items.map((item) => item.kind))].sort()).toStrictEqual([
			"return",
			"step",
			"throw",
		]);
		expect(
			[
				...new Set(
					[...items, ...graph.edges].map((item) => item.iterationKind)
				),
			].sort()
		).toStrictEqual(["callback", "concurrent", "loop", null]);
		expect(
			items.some((item) => item.kind === "throw" && item.mergedIntoCall)
		).toBe(true);
		expect(
			items.some((item) => item.kind === "throw" && !item.mergedIntoCall)
		).toBe(true);
		expect(
			items.some((item) => item.kind === "return" && item.expression === null)
		).toBe(true);
		expect(graph.edges.some((edge) => edge.guardThrow !== null)).toBe(true);
		expect(graph.edges.some((edge) => edge.awaited)).toBe(true);
		expect(graph.edges.some((edge) => edge.assignedTo !== null)).toBe(true);
		expect(graph.edges.some((edge) => edge.tryRegion !== null)).toBe(true);
		expect(
			[...items, ...graph.edges].some((item) => item.comment !== null)
		).toBe(true);
		expect(
			Math.max(
				...[...items, ...graph.edges].map((item) => item.conditionPath.length)
			)
		).toBeGreaterThan(1);
		expect(graph.entries.some((entry) => entry.swagger !== null)).toBe(true);
		expect(graph.entries.some((entry) => entry.returnType !== null)).toBe(true);
	});

	it("decodes back to the graph it encoded", () => {
		expect(decodeCodeGraph(encoded)).toStrictEqual(graph);
	});

	it("survives a real JSON round trip", () => {
		const parsed = JSON.parse(JSON.stringify(encoded)) as EncodedCodeGraph;
		expect(decodeCodeGraph(parsed)).toStrictEqual(graph);
	});

	it("keeps every field of every node", () => {
		const decoded = decodeCodeGraph(encoded);
		expect(decoded.nodes).toHaveLength(graph.nodes.length);
		for (const [index, node] of graph.nodes.entries()) {
			expectSameFields(node, decoded.nodes[index], `node[${index}]`);
			expect(decoded.nodes[index].body).toHaveLength(node.body.length);
			for (const [itemIndex, item] of node.body.entries()) {
				expectSameFields(
					item,
					decoded.nodes[index].body[itemIndex],
					`node[${index}].body[${itemIndex}]`
				);
			}
		}
	});

	it("keeps every field of every edge and entry", () => {
		const decoded = decodeCodeGraph(encoded);
		expect(decoded.edges).toHaveLength(graph.edges.length);
		for (const [index, edge] of graph.edges.entries()) {
			expectSameFields(edge, decoded.edges[index], `edge[${index}]`);
		}
		expect(decoded.entries).toHaveLength(graph.entries.length);
		for (const [index, entry] of graph.entries.entries()) {
			expectSameFields(entry, decoded.entries[index], `entry[${index}]`);
		}
	});

	it("keeps a static node static and keeps the dot in its id", () => {
		const before = graph.nodes.filter((node) => node.isStatic);
		const after = decodeCodeGraph(encoded).nodes.filter(
			(node) => node.isStatic
		);
		expect(after).toStrictEqual(before);
		for (const node of after) {
			expect(node.id).toBe(
				`${node.filePath}::${node.className}.${node.methodName}`
			);
			expect(node.id).not.toContain("#");
		}
	});

	it("keeps a db node's member and the member.method id", () => {
		const before = graph.nodes.filter((node) => node.member !== undefined);
		const after = decodeCodeGraph(encoded).nodes.filter(
			(node) => node.member !== undefined
		);
		expect(after).toStrictEqual(before);
		for (const node of after) {
			expect(node.id).toBe(
				`${node.filePath}::${node.className}#${node.member}.${node.methodName}`
			);
		}
	});

	it("keeps the reason on every unresolved node", () => {
		const decoded = decodeCodeGraph(encoded);
		const reasonById = new Map(
			decoded.nodes.map((node) => [node.id, node.unresolved])
		);
		const seen = new Set<string>();
		for (const node of graph.nodes) {
			if (node.unresolved !== undefined) {
				seen.add(node.unresolved);
				expect(reasonById.get(node.id)).toBe(node.unresolved);
			}
		}
		expect(seen.size).toBe(4);
	});

	it("decodes an absent conditionPath to an empty array", () => {
		const index = graph.edges.findIndex(
			(edge) => edge.conditionPath.length === 0
		);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(encoded.edges[index]).not.toHaveProperty("cp");
		expect(decodeCodeGraph(encoded).edges[index].conditionPath).toStrictEqual(
			[]
		);
	});

	it("omits a false or null default and puts it back on decode", () => {
		const index = graph.edges.findIndex(
			(edge) =>
				!(edge.awaited || edge.conditional) &&
				edge.guardThrow === null &&
				edge.assignedTo === null &&
				edge.comment === null &&
				edge.tryRegion === null
		);
		expect(index).toBeGreaterThanOrEqual(0);
		const raw = encoded.edges[index];
		for (const key of ["w", "cd", "gt", "a", "cm", "tr"]) {
			expect(raw).not.toHaveProperty(key);
		}
		const back = decodeCodeGraph(encoded).edges[index];
		expect(back.awaited).toBe(false);
		expect(back.conditional).toBe(false);
		expect(back.guardThrow).toBeNull();
		expect(back.assignedTo).toBeNull();
		expect(back.comment).toBeNull();
		expect(back.tryRegion).toBeNull();
	});

	it("omits an empty body and decodes it back to an empty array", () => {
		const index = graph.nodes.findIndex((node) => node.body.length === 0);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(encoded.nodes[index]).not.toHaveProperty("y");
		expect(decodeCodeGraph(encoded).nodes[index].body).toStrictEqual([]);
	});

	it("writes no node id and no file path outside the file table", () => {
		expect(JSON.stringify(encoded)).not.toContain("::");
		const withoutFiles = JSON.stringify({
			edges: encoded.edges,
			entries: encoded.entries,
			nodes: encoded.nodes,
		});
		expect(withoutFiles).not.toContain("cg-codec");
		for (const path of encoded.files) {
			if (path !== "") {
				expect(withoutFiles).not.toContain(path);
			}
		}
	});

	it("names every file once and indexes every node into the table", () => {
		expect(new Set(encoded.files).size).toBe(encoded.files.length);
		expect(encoded.files.length).toBeLessThan(encoded.nodes.length);
		for (const node of encoded.nodes) {
			const index = node.f as number;
			expect(Number.isInteger(index)).toBe(true);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(encoded.files.length);
		}
	});

	it("writes materially fewer bytes than the graph it came from", () => {
		const before = JSON.stringify(graph).length;
		const after = JSON.stringify(encoded).length;
		expect(after / before).toBeLessThan(0.6);
	});

	it("stamps version 1", () => {
		expect(encoded.version).toBe(1);
	});
});

describe("merging sub-project graphs", () => {
	let api: CodeGraph;
	let admin: CodeGraph;
	let lib: CodeGraph;
	let sharedId: string;

	beforeAll(async () => {
		api = await graphAt(`${MONO}/apps/api`);
		admin = await graphAt(`${MONO}/apps/admin`);
		lib = await graphAt(`${MONO}/libs/shared`);
		sharedId =
			api.nodes.find((node) => node.className === "SharedService")?.id ?? "";
	}, 60_000);

	it("reaches the shared method from both sub-projects", () => {
		expect(sharedId).not.toBe("");
		expect(admin.nodes.some((node) => node.id === sharedId)).toBe(true);
	});

	it("holds the shared method once", () => {
		const merged = mergeCodeGraphs([api, admin]);
		expect(merged.nodes.filter((node) => node.id === sharedId)).toHaveLength(1);
		expect(new Set(merged.nodes.map((node) => node.id)).size).toBe(
			merged.nodes.length
		);
	});

	it("keeps both callers' edges and no duplicate call site", () => {
		const merged = mergeCodeGraphs([api, admin]);
		const callers = merged.edges
			.filter((edge) => edge.to === sharedId)
			.map((edge) => edge.from)
			.sort();
		expect(callers).toHaveLength(2);
		expect(new Set(callers).size).toBe(2);
		const twice = mergeCodeGraphs([api, admin, api, admin]);
		expect(twice).toStrictEqual(merged);
	});

	it("keeps both sub-projects' entries", () => {
		const merged = mergeCodeGraphs([api, admin]);
		const classes = merged.entries.map((entry) => entry.controllerClass).sort();
		expect(classes).toStrictEqual(["AdminController", "ApiController"]);
		expect(merged.entries).toHaveLength(
			api.entries.length + admin.entries.length
		);
	});

	it("does not depend on the order of the sub-projects", () => {
		expect(mergeCodeGraphs([api, admin])).toStrictEqual(
			mergeCodeGraphs([admin, api])
		);
	});

	// A shared library scanned as its own sub-project fills in the body its
	// consumers only stub. mergeCodeGraphs keeps the first node it sees for an id.
	it("does not depend on where the library graph sits", () => {
		expect(mergeCodeGraphs([api, lib])).toStrictEqual(
			mergeCodeGraphs([lib, api])
		);
	});

	it("returns an equivalent graph for a single sub-project", () => {
		expect(mergeCodeGraphs([api])).toStrictEqual(api);
	});

	it("returns empty arrays for no sub-projects", () => {
		expect(mergeCodeGraphs([])).toStrictEqual({
			edges: [],
			entries: [],
			nodes: [],
		});
	});

	it("leaves no edge or entry pointing outside the merged nodes", () => {
		const merged = mergeCodeGraphs([api, admin, lib]);
		expect(danglingEdges(merged)).toStrictEqual([]);
		const ids = new Set(merged.nodes.map((node) => node.id));
		expect(
			merged.entries.filter((entry) => !ids.has(entry.node))
		).toStrictEqual([]);
	});

	it("round trips the merged graph through the codec", () => {
		const merged = mergeCodeGraphs([api, admin, lib]);
		const json = JSON.stringify(encodeCodeGraph(merged));
		expect(decodeCodeGraph(JSON.parse(json))).toStrictEqual(merged);
	});
});

describe("the graph the scan pays for", () => {
	let context: AnalysisContext;

	beforeAll(async () => {
		context = await contextAt(FIXTURE);
	}, 60_000);

	it("builds once and hands the same object back", () => {
		expect(codeGraphFor(context)).toBe(codeGraphFor(context));
	});

	it("drops the cache on an edit and rebuilds a valid graph", () => {
		const first = codeGraphFor(context);
		updateFile(context, context.files[0]);
		const second = codeGraphFor(context);
		expect(second).not.toBe(first);
		expect(danglingEdges(second)).toStrictEqual([]);
		expect(second).toStrictEqual(first);
	});

	it("leaves the key out of the artifact when no graph is passed", async () => {
		const result = buildResult(context, await diagnose(context)).result;
		const artifact = buildReportArtifact({
			moduleGraph: context.moduleGraph,
			result,
			version: "test",
		});
		expect(artifact).not.toHaveProperty("codeGraph");
		expect(JSON.stringify(artifact)).not.toContain("codeGraph");
	});

	it("carries a graph that decodes back to the original", async () => {
		const graph = codeGraphFor(context);
		const result = buildResult(context, await diagnose(context)).result;
		const artifact = buildReportArtifact({
			codeGraph: encodeCodeGraph(graph),
			moduleGraph: context.moduleGraph,
			result,
			version: "test",
		});
		expect(artifact.codeGraph).toBeDefined();
		expect(
			decodeCodeGraph(artifact.codeGraph as EncodedCodeGraph)
		).toStrictEqual(graph);
	});
});
