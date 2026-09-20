import { describe, expect, it } from "vitest";
import type {
	CallEdge,
	CodeGraph,
	MethodNode,
} from "../../src/common/code-graph.js";
import { buildEndpoints } from "../../src/report/ui/app/lib/descent-walk.js";
import {
	explainEndpoint,
	explainEndpoints,
} from "../../src/report/ui/app/lib/explain.js";
import { DESCENT_GRAPH } from "./report-artifact-fixture.js";

const CTX = { version: "0.0.0-test" };

function route(graph: CodeGraph, path: string) {
	const endpoint = buildEndpoints(graph).find((e) => e.routePath === path);
	if (!endpoint) {
		throw new Error(`no route ${path}`);
	}
	return endpoint;
}

/** A controller calling a chain of `count` db nodes, one per step. */
function chain(count: number): CodeGraph {
	const node = (id: string, kind: MethodNode["kind"]): MethodNode => ({
		body: [],
		classMethodCount: 1,
		className: "C",
		endLine: 2,
		filePath: "/repo/src/c.ts",
		id,
		kind,
		line: 1,
		methodName: id,
		parameters: [],
		returnType: null,
	});
	const edge = (from: string, to: string): CallEdge => ({
		assignedTo: null,
		awaited: true,
		branchGroupId: null,
		branchKind: null,
		comment: null,
		conditional: false,
		conditionPath: [],
		conditionText: null,
		from,
		guardThrow: null,
		iterationKind: null,
		iterationLabel: null,
		line: 1,
		order: 0,
		to,
		tryRegion: null,
	});
	const nodes = [node("entry", "controller")];
	const edges: CallEdge[] = [];
	for (let i = 0; i < count; i++) {
		nodes.push(node(`find${i}`, "db"));
		edges.push(edge(i === 0 ? "entry" : `find${i - 1}`, `find${i}`));
	}
	return {
		edges,
		entries: [
			{
				controllerClass: "C",
				handlerMethod: "entry",
				httpMethod: "get",
				node: "entry",
				returnType: null,
				routePath: "/chain",
				swagger: null,
			},
		],
		nodes,
	};
}

describe("explainEndpoint", () => {
	it("prints the route, the verdict, the kept steps and the conditions above them", () => {
		expect(explainEndpoint(route(DESCENT_GRAPH, "/a"), CTX)).toBe(
			[
				"POST /a → AController.handle  (src/a.controller.ts:1)",
				"verdict: read before write · @2 then @5  (2 read · 1 write)",
				"  first database read at step 2, first write at step 5; direction comes from the ORM method name, and TypeORM create and merge do not count",
				"",
				"steps (database preset, 3 of 10):",
				" … 2 hidden",
				" @2    PrismaService#user.findUnique        db read                src/a.service.ts:2",
				" … 2 hidden",
				" @5    PrismaService#user.update            db write               src/a.service.ts:2",
				" … 1 hidden",
				" @7    PrismaService#user.findUnique        db read  again         src/a.service.ts:2",
				" … 2 hidden",
				"conditions:",
				" @4  AService#save runs only when a condition holds",
				"",
				"nestjs-doctor 0.0.0-test · https://nestjs.doctor/docs/report#endpoints",
				"Source order of call sites walked depth-first, not a runtime trace. Read the docs before editing.",
				"",
			].join("\n")
		);
	});

	it("keeps every step of a short walk and says when no db node was reached", () => {
		const text = explainEndpoint(route(DESCENT_GRAPH, "/a/peek"), CTX);
		expect(text).toContain(
			"verdict: no db node on this path  (0 read · 0 write)"
		);
		expect(text).toContain(
			"the walk reached no node the scan classified as db"
		);
		expect(text).toContain("steps (all preset, 1 of 1):");
		expect(text).not.toContain("conditions:");
	});

	it("frames the call sites of the first read and write when the source is known", () => {
		const text = explainEndpoint(route(DESCENT_GRAPH, "/a"), {
			...CTX,
			sources: {
				"src/a.service.ts":
					"class AService {\n  load() { return find(); }\n  save() {}\n}",
			},
		});
		expect(text).toContain(
			[
				"code:",
				" src/a.service.ts",
				"     1  class AService {",
				">    2    load() { return find(); }",
				"     3    save() {}",
			].join("\n")
		);
	});

	it("degrades to labels when a shared file carries no source", () => {
		const text = explainEndpoint(route(DESCENT_GRAPH, "/a"), {
			...CTX,
			sources: {},
		});
		expect(text).not.toContain("code:");
	});

	it("strips the scan root and stops after thirty step lines", () => {
		const text = explainEndpoint(route(chain(60), "/chain"), {
			...CTX,
			root: "/repo",
		});
		expect(text).toContain("GET /chain → C.entry  (src/c.ts:1)");
		expect(text).toContain("steps (database preset, 60 of 61):");
		expect(text).toContain(" @30   C#find29");
		expect(text).not.toContain(" @31   C#find30");
		expect(text).toContain(" … and 30 more steps");
		expect(text).not.toContain("/repo/");
	});

	it("is the same bytes twice", () => {
		const endpoint = route(DESCENT_GRAPH, "/a");
		expect(explainEndpoint(endpoint, CTX)).toBe(explainEndpoint(endpoint, CTX));
	});
});

describe("explainEndpoints", () => {
	it("keys every route of a graph by controller, handler and path", () => {
		const texts = explainEndpoints(DESCENT_GRAPH, CTX);
		expect([...texts.keys()]).toEqual([
			"AController.handle:/a",
			"AController.peek:/a/peek",
		]);
	});
});
