import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type {
	CallEdge,
	CodeGraph,
	MethodNode,
	NodeId,
} from "../../src/common/code-graph.js";
import { indexNodes, reachableFrom } from "../../src/common/code-graph.js";
import {
	buildAnalysisContext,
	codeGraphFor,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-identity");
const BACKSLASH = /\\/g;
const SRC = `${FIXTURE.replace(BACKSLASH, "/")}/src`;

const SHARED = `${SRC}/shared.service.ts`;
const DIAMOND = `${SRC}/diamond.service.ts`;
const LOOPS = `${SRC}/loops.service.ts`;
const HELPERS = `${SRC}/helpers.ts`;
const NAMING = `${SRC}/naming.service.ts`;
const TOKEN = `${SRC}/token.service.ts`;
const PRISMA = `${SRC}/prisma.service.ts`;
const OVERLOAD = `${SRC}/overload.service.ts`;
const NOTIFY_ONE = `${SRC}/dup/one/notify.service.ts`;
const NOTIFY_TWO = `${SRC}/dup/two/notify.service.ts`;
const MAILER_ONE = `${SRC}/tokens/one/mailer.ts`;
const MAILER_TWO = `${SRC}/tokens/two/mailer.ts`;
const BASE_OPS = `${SRC}/inherit/base.service.ts`;
const SUBCLASSES = `${SRC}/inherit/subclasses.service.ts`;
const OVERRIDE_BASE = `${SRC}/inherit/override-base.ts`;
const OVERRIDE_CHILD = `${SRC}/inherit/override-child.service.ts`;
const LEVELS = `${SRC}/inherit/levels.ts`;
const LEVEL_A = `${SRC}/inherit/level-a.service.ts`;

async function buildGraph(): Promise<CodeGraph> {
	const scanConfig = await resolveScanConfig(FIXTURE);
	return codeGraphFor(await buildAnalysisContext(FIXTURE, scanConfig));
}

describe("code graph node identity", () => {
	let graph: CodeGraph;
	let byId: Map<NodeId, MethodNode>;

	const nodesWith = (id: NodeId): MethodNode[] =>
		graph.nodes.filter((node) => node.id === id);
	const inbound = (id: NodeId): CallEdge[] =>
		graph.edges.filter((edge) => edge.to === id);
	const outbound = (id: NodeId): CallEdge[] =>
		graph.edges.filter((edge) => edge.from === id);
	const node = (id: NodeId): MethodNode => {
		const found = byId.get(id);
		if (!found) {
			throw new Error(`no node ${id}`);
		}
		return found;
	};

	beforeAll(async () => {
		graph = await buildGraph();
		byId = indexNodes(graph);
	});

	describe("deduplication", () => {
		it("gives five endpoints across three controllers one shared node", () => {
			const audit = `${SHARED}::SharedService#audit`;

			expect(nodesWith(audit)).toHaveLength(1);
			expect(inbound(audit)).toHaveLength(5);
			expect(new Set(inbound(audit).map((edge) => edge.from))).toEqual(
				new Set([
					`${SRC}/alpha.controller.ts::AlphaController#one`,
					`${SRC}/alpha.controller.ts::AlphaController#two`,
					`${SRC}/beta.controller.ts::BetaController#one`,
					`${SRC}/beta.controller.ts::BetaController#two`,
					`${SRC}/gamma.controller.ts::GammaController#one`,
				])
			);
		});

		it("gives two calls from one method one node and two ordered edges", () => {
			const hit = `${LOOPS}::TargetService#hit`;
			const edges = inbound(hit);

			expect(nodesWith(hit)).toHaveLength(1);
			expect(edges).toHaveLength(2);
			expect(
				edges.every((edge) => edge.from === `${LOOPS}::TwiceService#run`)
			).toBe(true);
			expect(new Set(edges.map((edge) => edge.order)).size).toBe(2);
		});

		it("joins a diamond on one node with two inbound edges", () => {
			const sink = `${DIAMOND}::DiamondD#sink`;

			expect(nodesWith(sink)).toHaveLength(1);
			expect(new Set(inbound(sink).map((edge) => edge.from))).toEqual(
				new Set([`${DIAMOND}::DiamondB#step`, `${DIAMOND}::DiamondC#step`])
			);
			expect(inbound(sink)).toHaveLength(2);
		});

		it("closes a cycle with an edge instead of a second node", () => {
			const ping = `${LOOPS}::CycleA#ping`;
			const pong = `${LOOPS}::CycleB#pong`;

			expect(nodesWith(ping)).toHaveLength(1);
			expect(nodesWith(pong)).toHaveLength(1);
			expect(outbound(ping).map((edge) => edge.to)).toEqual([pong]);
			expect(outbound(pong).map((edge) => edge.to)).toEqual([ping]);
		});

		it("gives self-recursion one node and a self-edge", () => {
			const countdown = `${LOOPS}::RecursiveService#countdown`;

			expect(nodesWith(countdown)).toHaveLength(1);
			expect(outbound(countdown).map((edge) => edge.to)).toEqual([countdown]);
		});

		it("reaches the transitive set and nothing outside it", () => {
			const start = `${DIAMOND}::DiamondA#start`;

			expect(reachableFrom(graph, [start])).toEqual(
				new Set([
					start,
					`${DIAMOND}::DiamondB#step`,
					`${DIAMOND}::DiamondC#step`,
					`${DIAMOND}::DiamondD#sink`,
				])
			);
			expect(reachableFrom(graph, [start])).not.toContain(
				`${SHARED}::SharedService#audit`
			);
		});

		it("terminates on a cycle and reaches both of its nodes", () => {
			expect(reachableFrom(graph, [`${LOOPS}::CycleA#ping`])).toEqual(
				new Set([`${LOOPS}::CycleA#ping`, `${LOOPS}::CycleB#pong`])
			);
		});
	});

	describe("no collisions", () => {
		it("keeps two same-named classes in different files apart", () => {
			const one = `${NOTIFY_ONE}::NotifyService#send`;
			const two = `${NOTIFY_TWO}::NotifyService#send`;

			expect(nodesWith(one)).toHaveLength(1);
			expect(nodesWith(two)).toHaveLength(1);
			expect(inbound(one).map((edge) => edge.from)).toEqual([
				`${SRC}/dup/one/caller.service.ts::DupOneCaller#run`,
			]);
			expect(inbound(two).map((edge) => edge.from)).toEqual([
				`${SRC}/dup/two/caller.service.ts::DupTwoCaller#run`,
			]);
		});

		it("keeps a static and an instance method of one name apart", () => {
			const instance = `${TOKEN}::TokenService#format`;
			const statik = `${TOKEN}::TokenService.format`;
			const caller = `${TOKEN}::TokenCaller#run`;

			expect(nodesWith(instance)).toHaveLength(1);
			expect(nodesWith(statik)).toHaveLength(1);
			expect(node(statik).isStatic).toBe(true);
			expect(node(instance).isStatic).toBeUndefined();
			expect(new Set(outbound(caller).map((edge) => edge.to))).toEqual(
				new Set([instance, statik])
			);
		});

		it("keeps two same-named interface tokens apart by declaring file", () => {
			const one = `${MAILER_ONE}::Mailer#send`;
			const two = `${MAILER_TWO}::Mailer#send`;

			expect(nodesWith(one)).toHaveLength(1);
			expect(nodesWith(two)).toHaveLength(1);
			expect(node(one).unresolved).toBe("interface-token");
			expect(node(two).unresolved).toBe("interface-token");
			expect(node(one).filePath).toBe(MAILER_ONE);
			expect(node(two).filePath).toBe(MAILER_TWO);
			expect(inbound(one).map((edge) => edge.from)).toEqual([
				`${SRC}/tokens/one/consumer.service.ts::MailerOneConsumer#run`,
			]);
			expect(inbound(two).map((edge) => edge.from)).toEqual([
				`${SRC}/tokens/two/consumer.service.ts::MailerTwoConsumer#run`,
			]);
		});

		it("keeps a free function and a method of one name apart", () => {
			const free = `${HELPERS}::#normalize`;
			const method = `${NAMING}::NamingService#normalize`;

			expect(nodesWith(free)).toHaveLength(1);
			expect(nodesWith(method)).toHaveLength(1);
			expect(node(free).className).toBe("");
			expect(
				new Set(outbound(`${NAMING}::NamingCaller#run`).map((e) => e.to))
			).toEqual(new Set([free, method]));
		});

		it("keeps two members of one db service apart", () => {
			const user = `${PRISMA}::PrismaService#user.find`;
			const order = `${PRISMA}::PrismaService#order.find`;

			expect(nodesWith(user)).toHaveLength(1);
			expect(nodesWith(order)).toHaveLength(1);
			expect(node(user).member).toBe("user");
			expect(node(order).member).toBe("order");
			expect(node(user).kind).toBe("db");
			expect(
				new Set(outbound(`${PRISMA}::OrdersRepository#load`).map((e) => e.to))
			).toEqual(new Set([user, order]));
		});

		// The parser hides node_modules, so every external type resolves to
		// `external-package` with an empty file path and one name means one node.
		it("keeps two same-named external types apart", () => {
			const send = "::Client#send";
			const one = `${SRC}/external/one.service.ts::ExternalOneService#run`;
			const two = `${SRC}/external/two.service.ts::ExternalTwoService#run`;

			expect(outbound(one).map((edge) => edge.to)).not.toEqual(
				outbound(two).map((edge) => edge.to)
			);
			expect(inbound(send).length).toBeLessThan(2);
		});

		it("keeps one method name on two unrelated services apart", () => {
			const b = `${DIAMOND}::DiamondB#step`;
			const c = `${DIAMOND}::DiamondC#step`;

			expect(nodesWith(b)).toHaveLength(1);
			expect(nodesWith(c)).toHaveLength(1);
			expect(
				outbound(`${DIAMOND}::DiamondA#start`).map((edge) => edge.to)
			).toEqual([b, c]);
		});
	});

	describe("inheritance", () => {
		it("gives two subclasses one base node in the base file", () => {
			const shared = `${BASE_OPS}::BaseOps#shared`;

			expect(nodesWith(shared)).toHaveLength(1);
			expect(node(shared).filePath).toBe(BASE_OPS);
			expect(new Set(inbound(shared).map((edge) => edge.from))).toEqual(
				new Set([`${SUBCLASSES}::FirstOps#run`, `${SUBCLASSES}::SecondOps#run`])
			);
		});

		it("separates an override from the base it shadows", () => {
			const base = `${OVERRIDE_BASE}::OverrideBase#label`;
			const override = `${OVERRIDE_CHILD}::OverrideChild#label`;

			expect(nodesWith(base)).toHaveLength(1);
			expect(nodesWith(override)).toHaveLength(1);
			expect(
				outbound(`${OVERRIDE_CHILD}::OverrideChild#use`).map((edge) => edge.to)
			).toEqual([override]);
			expect(outbound(override).map((edge) => edge.to)).toEqual([base]);
		});

		// findMethodInHierarchy keys its visited set by class name, so a base
		// class sharing the subclass name stops the walk before it is searched.
		it("reaches a base class that shares the subclass name", () => {
			const fromBase = `${SRC}/rebase/base/ops.service.ts::Ops#fromBase`;

			expect(
				outbound(`${SRC}/rebase/child/ops.service.ts::Ops#run`).map(
					(edge) => edge.to
				)
			).toEqual([fromBase]);
		});

		it("walks three levels to the declaring class", () => {
			const deep = `${LEVELS}::LevelC#deep`;

			expect(nodesWith(deep)).toHaveLength(1);
			expect(outbound(`${LEVEL_A}::LevelA#go`).map((edge) => edge.to)).toEqual([
				deep,
			]);
		});
	});

	describe("shape", () => {
		it("gives an overloaded method one node at the implementation", () => {
			const render = `${OVERLOAD}::OverloadService#render`;

			expect(nodesWith(render)).toHaveLength(1);
			expect(node(render).line).toBe(7);
			expect(node(render).endLine).toBe(9);
			expect(node(render).parameters).toEqual([
				{ name: "value", type: "string | number" },
			]);
			expect(node(render).returnType).toBe("string");
		});

		it("populates the source span and signature of a normal method", () => {
			const audit = node(`${SHARED}::SharedService#audit`);

			expect(audit.classMethodCount).toBe(2);
			expect(audit.line).toBe(5);
			expect(audit.endLine).toBe(7);
			expect(audit.parameters.map((param) => param.name)).toEqual([
				"actor",
				"count",
			]);
			expect(audit.parameters[0].type).toBe("string");
			expect(audit.returnType).toBe("string");
			expect(audit.kind).toBe("service");
		});

		it("leaves a synthetic node without a source span", () => {
			for (const id of [
				`${PRISMA}::PrismaService#user.find`,
				`${MAILER_ONE}::Mailer#send`,
			]) {
				expect(node(id).line).toBe(0);
				expect(node(id).endLine).toBe(0);
				expect(node(id).classMethodCount).toBe(0);
				expect(node(id).parameters).toEqual([]);
				expect(node(id).returnType).toBeNull();
			}
		});
	});

	describe("global invariants", () => {
		it("has no duplicate node id", () => {
			const ids = graph.nodes.map((entry) => entry.id);

			expect(new Set(ids).size).toBe(ids.length);
		});

		it("has no dangling edge", () => {
			const dangling = graph.edges.filter(
				(edge) => !(byId.has(edge.from) && byId.has(edge.to))
			);

			expect(dangling).toEqual([]);
		});

		it("resolves every entry point to a node", () => {
			expect(graph.entries.length).toBeGreaterThan(0);
			expect(graph.entries.filter((entry) => !byId.has(entry.node))).toEqual(
				[]
			);
		});

		it("builds the same graph twice", async () => {
			expect(await buildGraph()).toEqual(graph);
		});
	});
});
