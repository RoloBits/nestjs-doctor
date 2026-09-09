import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type {
	CallEdge,
	CodeGraph,
	MethodNode,
} from "../../src/common/code-graph.js";
import {
	buildAnalysisContext,
	codeGraphFor,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-call-shapes");

const NOTES = "/src/notes.service.ts::NotesService";
const CHAIN = "/src/chain.service.ts::ChainService";

function node(graph: CodeGraph, suffix: string): MethodNode | undefined {
	return graph.nodes.find((candidate) => candidate.id.endsWith(suffix));
}

function nodes(graph: CodeGraph, suffix: string): MethodNode[] {
	return graph.nodes.filter((candidate) => candidate.id.endsWith(suffix));
}

function from(graph: CodeGraph, suffix: string): CallEdge[] {
	return graph.edges.filter((edge) => edge.from.endsWith(suffix));
}

/** The callee ids of every edge leaving the node whose id ends with `suffix`. */
function targets(graph: CodeGraph, suffix: string): string[] {
	return from(graph, suffix).map((edge) => edge.to);
}

describe("code graph call shapes", () => {
	let graph: CodeGraph;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		graph = codeGraphFor(await buildAnalysisContext(FIXTURE, scanConfig));
	});

	it("resolves this.injectedDep.method() to the dependency's method", () => {
		expect(targets(graph, `${NOTES}#direct`)).toEqual([
			expect.stringContaining("/src/prisma.service.ts::PrismaService#connect"),
		]);
	});

	it("resolves this.injectedDep.member.method() to a db node carrying the member", () => {
		const [target] = targets(graph, `${NOTES}#viaMember`);
		expect(target).toContain(
			"/src/prisma.service.ts::PrismaService#user.findUnique"
		);
		const db = node(graph, "::PrismaService#user.findUnique");
		expect(db?.kind).toBe("db");
		expect(db?.member).toBe("user");
		expect(db?.methodName).toBe("findUnique");
	});

	it("resolves this.helper() to the same class", () => {
		expect(targets(graph, `${NOTES}#callsHelper`)).toEqual([
			expect.stringContaining(`${NOTES}#sameClassHelper`),
		]);
	});

	it("resolves this.inherited() to the base class's own file", () => {
		expect(targets(graph, `${NOTES}#callsInherited`)).toEqual([
			expect.stringContaining("/src/base.service.ts::BaseService#inherited"),
		]);
	});

	it("resolves super.method() to the base declaration even when overridden", () => {
		const targeted = targets(graph, `${NOTES}#overridden`);
		expect(targeted).toEqual([
			expect.stringContaining("/src/base.service.ts::BaseService#overridden"),
		]);
		expect(targeted[0]).not.toContain("NotesService");
	});

	it("resolves self-recursion to an edge from the node back to itself", () => {
		const edges = from(graph, `${NOTES}#recurse`);
		expect(edges).toHaveLength(1);
		expect(edges[0].to).toBe(edges[0].from);
	});

	it("resolves a bare helper() to the declared free function", () => {
		const [target] = targets(graph, `${NOTES}#callsFree`);
		expect(target).toContain("/src/helpers.ts::#formatLabel");
		const helper = node(graph, "/src/helpers.ts::#formatLabel");
		expect(helper?.kind).toBe("function");
		expect(helper?.className).toBe("");
		expect(helper?.isStatic).toBeUndefined();
	});

	it("resolves Klass.staticMethod() to the declared static", () => {
		const [target] = targets(graph, `${NOTES}#callsStatic`);
		expect(target).toContain("/src/mailer.ts::Mailer.send");
		const statik = node(graph, "/src/mailer.ts::Mailer.send");
		expect(statik?.kind).toBe("function");
		expect(statik?.isStatic).toBe(true);
	});

	it("resolves an alias local the same way as the injected member", () => {
		expect(targets(graph, `${NOTES}#viaAlias`)).toEqual([
			expect.stringContaining("/src/prisma.service.ts::PrismaService#connect"),
		]);
	});

	it("resolves a dep injected by @Inject() on a property", () => {
		expect(
			targets(graph, "/src/cache.consumer.ts::CacheConsumer#read")
		).toEqual([
			expect.stringContaining("/src/cache.service.ts::CacheService#get"),
		]);
	});

	it("marks an interface-token dep unresolved and keeps its declaring file", () => {
		const [aTarget] = targets(
			graph,
			"/src/clock-a.consumer.ts::ClockAConsumer#tick"
		);
		const [bTarget] = targets(
			graph,
			"/src/clock-b.consumer.ts::ClockBConsumer#tick"
		);
		expect(aTarget).toContain("/src/clock-a.ts::Clock#now");
		expect(bTarget).toContain("/src/clock-b.ts::Clock#now");
		expect(aTarget).not.toBe(bTarget);
		for (const id of [aTarget, bTarget]) {
			const target = graph.nodes.find((candidate) => candidate.id === id);
			expect(target?.kind).toBe("unresolved");
			expect(target?.unresolved).toBe("interface-token");
			expect(target?.filePath).toBe(id.split("::")[0]);
		}
	});

	// Defect: scanClass groups call sites by declared type name and maps back
	// with memberOfType, so both members resolve through the first-declared one.
	it("keeps two same-named interfaces apart inside one consumer class", () => {
		const targeted = targets(
			graph,
			"/src/clock-pair.consumer.ts::ClockPairConsumer#tickBoth"
		);
		expect(targeted).toHaveLength(2);
		expect(targeted.map((id) => id.replace(FIXTURE, "")).sort()).toEqual([
			"/src/clock-a.ts::Clock#now",
			"/src/clock-b.ts::Clock#now",
		]);
	});

	// Defect: same cause, with declared classes, so the second call lands on a
	// method of the wrong class in the wrong file.
	it("keeps two same-named classes apart inside one consumer class", () => {
		const targeted = targets(
			graph,
			"/src/store-pair.consumer.ts::StorePairConsumer#saveBoth"
		);
		expect(targeted).toHaveLength(2);
		expect(targeted.map((id) => id.replace(FIXTURE, "")).sort()).toEqual([
			"/src/store-a.ts::Store#save",
			"/src/store-b.ts::Store#save",
		]);
	});

	// Defect: resolveTypeNode names the node from the local reference text while
	// taking the file from the declaration, so an import alias splits one method.
	it("gives an aliased import the interface's own node", () => {
		expect(
			targets(graph, "/src/clock-alias.consumer.ts::ClockAliasConsumer#tick")
		).toEqual([expect.stringContaining("/src/clock-a.ts::Clock#now")]);
		expect(nodes(graph, "/src/clock-a.ts::Timepiece#now")).toEqual([]);
	});

	it("marks a dep typed from an npm package unresolved as external-package", () => {
		const [target] = targets(
			graph,
			"/src/redis.consumer.ts::RedisConsumer#ping"
		);
		const external = graph.nodes.find((candidate) => candidate.id === target);
		expect(external?.kind).toBe("unresolved");
		expect(external?.unresolved).toBe("external-package");
		expect(external?.className).toBe("Redis");
		expect(external?.methodName).toBe("ping");
	});

	it("ignores a call chained onto another call's result", () => {
		expect(node(graph, "/src/helpers.ts::Label#render")).toBeDefined();
		expect(targets(graph, `${CHAIN}#chained`)).toEqual([
			expect.stringContaining("/src/helpers.ts::#makeLabel"),
		]);
		expect(graph.edges.filter((edge) => edge.to.endsWith("#render"))).toEqual(
			[]
		);
	});

	it("ignores a call on a newly constructed instance", () => {
		expect(node(graph, "/src/helpers.ts::Greeter#greet")).toBeDefined();
		expect(from(graph, `${CHAIN}#constructed`)).toEqual([]);
		expect(graph.edges.filter((edge) => edge.to.endsWith("#greet"))).toEqual(
			[]
		);
	});

	it("ignores calls on locals holding built-in values", () => {
		expect(node(graph, `${CHAIN}#builtins`)).toBeDefined();
		expect(from(graph, `${CHAIN}#builtins`)).toEqual([]);
	});

	it("attributes a this. call inside a callback to the enclosing method", () => {
		const edges = from(graph, `${CHAIN}#mapped`);
		expect(edges).toHaveLength(1);
		expect(edges[0].to).toContain(`${CHAIN}#decorate`);
		expect(edges[0].iterationKind).toBe("callback");
		expect(edges[0].iterationLabel).toBe("map");
	});

	// A deferred callback is flattened into its enclosing method, and only an
	// iteration method sets iterationKind, so setTimeout leaves it null.
	it("attributes a this. call inside a deferred callback with no iteration kind", () => {
		const edges = from(graph, `${CHAIN}#deferred`);
		expect(edges).toHaveLength(1);
		expect(edges[0].to).toContain(`${CHAIN}#decorate`);
		expect(edges[0].iterationKind).toBeNull();
	});

	it("keeps a static and an instance method of the same name apart", () => {
		const instance = node(graph, "/src/mailer.ts::Mailer#send");
		const statik = node(graph, "/src/mailer.ts::Mailer.send");
		expect(instance?.isStatic).toBeUndefined();
		expect(statik?.isStatic).toBe(true);
		expect(instance?.id).not.toBe(statik?.id);
	});

	it("gives an overloaded method one node at the implementation", () => {
		const found = nodes(
			graph,
			"/src/overloaded.service.ts::OverloadedService#find"
		);
		expect(found).toHaveLength(1);
		expect(found[0].parameters).toEqual([
			expect.objectContaining({ name: "id", type: "string | number" }),
		]);
		expect(found[0].line).toBe(7);
	});

	it("leaves no edge endpoint or entry without a node", () => {
		const known = new Set(graph.nodes.map((candidate) => candidate.id));
		const dangling = new Set<string>();
		for (const edge of graph.edges) {
			for (const end of [edge.from, edge.to]) {
				if (!known.has(end)) {
					dangling.add(end);
				}
			}
		}
		for (const entry of graph.entries) {
			if (!known.has(entry.node)) {
				dangling.add(entry.node);
			}
		}
		expect([...dangling]).toEqual([]);
		expect(graph.entries.length).toBeGreaterThan(0);
	});
});
