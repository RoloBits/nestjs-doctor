import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { CodeGraph } from "../../src/common/code-graph.js";
import {
	decodeCodeGraph,
	encodeCodeGraph,
} from "../../src/common/code-graph-codec.js";
import { buildCodeGraph } from "../../src/engine/graph/code-graph.js";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";
import { CONTRACT_FILES } from "./code-graph-contract.fixture.js";

function build(): CodeGraph {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(CONTRACT_FILES)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	const providers = resolveProviders(project, paths);
	const endpoints = buildEndpointGraph(project, paths, providers).endpoints;
	return buildCodeGraph(project, paths, providers, endpoints);
}

const GRAPH = build();

describe("code-graph-codec", () => {
	it("decodes back to the graph it encoded", () => {
		expect(decodeCodeGraph(encodeCodeGraph(GRAPH))).toStrictEqual(GRAPH);
	});

	it("survives a JSON round trip", () => {
		const json = JSON.stringify(encodeCodeGraph(GRAPH));
		expect(decodeCodeGraph(JSON.parse(json))).toStrictEqual(GRAPH);
	});

	it("names every file once and points nodes at the table", () => {
		const encoded = encodeCodeGraph(GRAPH);
		expect(new Set(encoded.files).size).toBe(encoded.files.length);
		expect(encoded.files.length).toBeLessThan(encoded.nodes.length);
		for (const node of encoded.nodes) {
			expect(encoded.files[node.f as number]).toBeTypeOf("string");
		}
	});

	it("refers to nodes by index instead of repeating the id", () => {
		const encoded = encodeCodeGraph(GRAPH);
		for (const edge of encoded.edges) {
			expect(encoded.nodes[edge.f as number]).toBeDefined();
			expect(encoded.nodes[edge.t as number]).toBeDefined();
		}
		expect(JSON.stringify(encoded)).not.toContain("::");
	});

	it("leaves out a field sitting at its default", () => {
		const encoded = encodeCodeGraph(GRAPH);
		const plain = encoded.edges.find((edge) => edge.cd === undefined);
		expect(plain).toBeDefined();
		expect(plain).not.toHaveProperty("ct");
		expect(plain).not.toHaveProperty("cp");
	});

	it("writes fewer bytes than the graph it came from", () => {
		const before = JSON.stringify(GRAPH).length;
		const after = JSON.stringify(encodeCodeGraph(GRAPH)).length;
		expect(after).toBeLessThan(before / 2);
	});
});
