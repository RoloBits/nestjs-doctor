import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type {
	BodyItem,
	CallEdge,
	CodeGraph,
	MethodNode,
	NodeId,
} from "../../src/common/code-graph.js";
import {
	buildAnalysisContext,
	codeGraphFor,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-body-items");

/** One entry of the merged body-item plus outgoing-edge execution sequence. */
interface SeqEntry {
	kind: BodyItem["kind"] | "call";
	line: number;
	order: number;
}

describe("code graph body items, exits and ordering", () => {
	let graph: CodeGraph;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		graph = codeGraphFor(await buildAnalysisContext(FIXTURE, scanConfig));
	});

	function nodeFor(suffix: string): MethodNode {
		const found = graph.nodes.filter((node) => node.id.endsWith(suffix));
		expect(found, `no unique node for ${suffix}`).toHaveLength(1);
		return found[0];
	}

	function outgoingOf(id: NodeId): CallEdge[] {
		return graph.edges.filter((edge) => edge.from === id);
	}

	function bodyOf(suffix: string): BodyItem[] {
		return nodeFor(suffix).body;
	}

	/** Body items and outgoing edges merged into the one execution sequence. */
	function sequence(id: NodeId): SeqEntry[] {
		const node = graph.nodes.find((candidate) => candidate.id === id);
		const items: SeqEntry[] = (node?.body ?? []).map((item) => ({
			kind: item.kind,
			line: item.line,
			order: item.order,
		}));
		for (const edge of outgoingOf(id)) {
			items.push({ kind: "call", line: edge.line, order: edge.order });
		}
		return items.sort((a, b) => a.order - b.order);
	}

	function sequenceOf(suffix: string): SeqEntry[] {
		return sequence(nodeFor(suffix).id);
	}

	function pairs(suffix: string): [string, number][] {
		return sequenceOf(suffix).map((entry) => [entry.kind, entry.line]);
	}

	const RETURNS = "/returns.service.ts::ReturnsService#";
	const THROWS = "/throws.service.ts::ThrowsService#";
	const STEPS = "/steps.service.ts::StepsService#";
	const ORDER = "/ordering.service.ts::OrderingService#";
	const META = "/meta.service.ts::MetaService#";
	const EDGE = "/edge-cases.service.ts::EdgeCasesService#";
	const GUARDS = "/guards.service.ts::GuardsService#";

	describe("returns", () => {
		it("records an early return inside an if as a conditional return item", () => {
			const body = bodyOf(`${RETURNS}earlyNull`);
			const early = body.find((item) => item.line === 10);
			expect(early).toMatchObject({
				conditional: true,
				expression: "null",
				kind: "return",
			});
			expect(early?.branchKind).toBe("if");
		});

		it("records the final return as unconditional", () => {
			const body = bodyOf(`${RETURNS}earlyNull`);
			const final = body.find((item) => item.line === 12);
			expect(final).toMatchObject({
				conditional: false,
				expression: "id",
				kind: "return",
			});
			expect(final?.conditionPath).toEqual([]);
		});

		it("gives a bare return a null expression", () => {
			const body = bodyOf(`${RETURNS}bare`);
			expect(body).toHaveLength(1);
			expect(body[0]).toMatchObject({
				expression: null,
				kind: "return",
				line: 17,
			});
		});

		it("records no return item for a method without a return statement", () => {
			const body = bodyOf(`${RETURNS}noReturn`);
			expect(body.filter((item) => item.kind === "return")).toEqual([]);
		});

		it("leaves a return inside a nested callback out of the method body", () => {
			const body = bodyOf(`${RETURNS}nested`);
			const returns = body.filter((item) => item.kind === "return");
			expect(returns.map((item) => item.line)).toEqual([29]);
		});

		it("records every branch return with its own line, in source order", () => {
			const body = bodyOf(`${RETURNS}branches`);
			const returns = body.filter((item) => item.kind === "return");
			expect(returns.map((item) => item.line)).toEqual([34, 37, 39]);
			expect(returns.map((item) => item.order)).toEqual([0, 1, 2]);
			expect(
				returns.map((item) => (item as { expression: string }).expression)
			).toEqual(['"a"', '"b"', '"c"']);
		});

		it("orders a returned awaited call before the return item", () => {
			expect(pairs(`${RETURNS}awaited`)).toEqual([
				["call", 43],
				["return", 43],
			]);
			const body = bodyOf(`${RETURNS}awaited`);
			expect(body[0]).toMatchObject({
				expression: "await this.repo.findOne(id)",
				kind: "return",
			});
		});
	});

	describe("throws", () => {
		it("captures the exception class and the message", () => {
			const body = bodyOf(`${THROWS}plain`);
			expect(body.find((item) => item.kind === "throw")).toMatchObject({
				exceptionClass: "NotFoundException",
				line: 14,
				message: "user missing",
			});
		});

		it("marks a throw inside a catch with branchKind catch", () => {
			const body = bodyOf(`${THROWS}caught`);
			const thrown = body.find((item) => item.kind === "throw");
			expect(thrown).toMatchObject({
				branchKind: "catch",
				conditional: true,
				exceptionClass: "BadRequestException",
				line: 23,
			});
		});

		it("leaves a throw outside a guard pattern unmerged", () => {
			const body = bodyOf(`${THROWS}plain`);
			expect(body.find((item) => item.kind === "throw")).toMatchObject({
				mergedIntoCall: false,
			});
		});

		it("folds a guard throw onto the edge and keeps it in the body", () => {
			const node = nodeFor(`${THROWS}guarded`);
			const edges = outgoingOf(node.id);
			expect(edges).toHaveLength(1);
			expect(edges[0].guardThrow).toMatchObject({
				className: "NotFoundException",
				conditionText: "!found",
				message: "no user",
			});
			const thrown = node.body.find((item) => item.kind === "throw");
			expect(thrown).toMatchObject({
				exceptionClass: "NotFoundException",
				line: 38,
				mergedIntoCall: true,
			});
		});

		// Defect: mergeGuardThrows only receives callEntries and memberCalls, so a
		// guard on a this.helper(), helper() or Klass.helper() result never merges.
		it("folds a guard throw onto a same-class call edge", () => {
			const node = nodeFor(`${GUARDS}viaHelper`);
			expect(outgoingOf(node.id)[0].guardThrow).toMatchObject({
				className: "NotFoundException",
				conditionText: "!clean",
			});
		});

		it("keeps the merged same-class throw in the sequence, flagged", () => {
			expect(pairs(`${GUARDS}viaHelper`)).toEqual([
				["call", 14],
				["throw", 16],
				["return", 18],
			]);
			expect(
				bodyOf(`${GUARDS}viaHelper`).find((item) => item.kind === "throw")
			).toMatchObject({ mergedIntoCall: true });
		});

		it("reports a rethrow of a non-new value as Error with no message", () => {
			const body = bodyOf(`${THROWS}rethrow`);
			expect(body.find((item) => item.kind === "throw")).toMatchObject({
				exceptionClass: "Error",
				line: 31,
				message: null,
			});
		});
	});

	describe("steps", () => {
		it("groups a run of plain statements between calls into one step", () => {
			const body = bodyOf(`${STEPS}mix`);
			const steps = body.filter((item) => item.kind === "step");
			expect(steps).toHaveLength(1);
			expect(steps[0].line).toBe(10);
			expect(
				(steps[0] as { statements: { assignedTo: string | null }[] }).statements
			).toEqual([
				{ assignedTo: "name", text: "name = id.trim()" },
				{ assignedTo: "key", text: 'key = name.concat("-key")' },
			]);
		});

		it("keeps a statement assigning from a tracked call out of the step", () => {
			expect(pairs(`${STEPS}mix`)).toEqual([
				["call", 9],
				["step", 10],
				["call", 12],
				["return", 13],
			]);
		});
	});

	describe("ordering and density", () => {
		it("numbers every node's merged sequence 0..n-1 with no gaps or duplicates", () => {
			const broken: string[] = [];
			for (const node of graph.nodes) {
				const orders = sequence(node.id).map((entry) => entry.order);
				const expected = orders.map((_, index) => index);
				if (JSON.stringify(orders) !== JSON.stringify(expected)) {
					broken.push(`${node.id} -> [${orders.join(", ")}]`);
				}
			}
			expect(broken).toEqual([]);
		});

		// A function declared inside a method body cannot be reached by name from
		// outside, so it takes no order and leaves no gap behind.
		it("leaves no gap for a call to a method-local function", () => {
			const orders = sequenceOf(`${EDGE}localFn`).map((entry) => entry.order);
			expect(orders).toEqual(orders.map((_, index) => index));
		});

		it("keeps the edge for a call to a module-level function", () => {
			expect(pairs(`${EDGE}moduleFn`)).toEqual([
				["call", 13],
				["return", 14],
			]);
		});

		it("sets the body once for an overloaded method", () => {
			expect(pairs(`${EDGE}overloaded`)).toEqual([
				["call", 28],
				["return", 29],
			]);
		});

		it("orders a call inside a loop before the return after it", () => {
			const node = nodeFor(`${EDGE}loop`);
			expect(pairs(`${EDGE}loop`)).toEqual([
				["call", 34],
				["return", 36],
			]);
			expect(outgoingOf(node.id)[0]).toMatchObject({
				iterationKind: "loop",
				iterationLabel: "for-of",
			});
		});

		it("splits two runs of plain statements into separate steps", () => {
			expect(pairs(`${EDGE}interleaved`)).toEqual([
				["call", 40],
				["step", 41],
				["call", 42],
				["step", 43],
				["return", 44],
			]);
		});

		// Defect: trackedPositions is filled by comparing line numbers, so every call
		// on a tracked call's line counts as tracked and its statement leaves the body.
		it("keeps a plain statement sharing a line with a call as a step", () => {
			expect(pairs(`${GUARDS}sameLine`)).toEqual([
				["step", 9],
				["call", 9],
				["return", 10],
			]);
		});

		it("orders a return inside try before the call in the finally", () => {
			expect(pairs(`${GUARDS}finallyReturn`)).toEqual([
				["call", 27],
				["return", 27],
				["call", 29],
			]);
		});

		it("orders a call inside a concurrent callback before the return", () => {
			expect(pairs(`${GUARDS}concurrent`)).toEqual([
				["call", 35],
				["return", 37],
			]);
		});

		it("tracks a same-class helper call instead of folding it into a step", () => {
			const node = nodeFor(`${EDGE}helperCall`);
			expect(pairs(`${EDGE}helperCall`)).toEqual([
				["call", 48],
				["return", 49],
			]);
			expect(outgoingOf(node.id)[0].to).toContain("EdgeCasesService#normalise");
		});

		it("orders an argument call before the call it is an argument to", () => {
			const node = nodeFor(`${ORDER}nestedArg`);
			const edges = outgoingOf(node.id).sort((a, b) => a.order - b.order);
			expect(edges.map((edge) => edge.to.split("#")[1])).toEqual([
				"findOne",
				"save",
			]);
			expect(pairs(`${ORDER}nestedArg`)).toEqual([
				["call", 12],
				["call", 12],
				["return", 12],
			]);
		});

		it("gives two calls on one line distinct, source-ordered orders", () => {
			const node = nodeFor(`${ORDER}sameLine`);
			const edges = outgoingOf(node.id).sort((a, b) => a.order - b.order);
			expect(edges.map((edge) => edge.order)).toEqual([0, 1]);
			expect(edges.map((edge) => edge.to.split("#")[1])).toEqual([
				"remove",
				"ping",
			]);
		});

		it("orders a multi-line call before the call that follows it", () => {
			const node = nodeFor(`${ORDER}multiLine`);
			const edges = outgoingOf(node.id).sort((a, b) => a.order - b.order);
			expect(
				edges.map((edge) => [edge.to.split("#")[1], edge.line, edge.order])
			).toEqual([
				["save", 20, 0],
				["ping", 24, 1],
			]);
		});

		it("interleaves calls, an early return, a throw and a final return", () => {
			expect(pairs(`${ORDER}full`)).toEqual([
				["call", 28],
				["return", 30],
				["throw", 33],
				["call", 35],
				["return", 36],
			]);
		});

		it("keeps every outgoing edge order inside the node's sequence range", () => {
			for (const node of graph.nodes) {
				const length = sequence(node.id).length;
				for (const edge of outgoingOf(node.id)) {
					expect(edge.order).toBeGreaterThanOrEqual(0);
					expect(edge.order).toBeLessThan(length);
				}
			}
		});
	});

	describe("metadata", () => {
		it("puts a leading line comment on the edge", () => {
			const edges = outgoingOf(nodeFor(`${META}annotated`).id);
			const first = edges.find((edge) => edge.line === 10);
			expect(first?.comment).toBe("load the user first");
		});

		it("sets assignedTo from a plain const declaration", () => {
			const edges = outgoingOf(nodeFor(`${META}annotated`).id);
			expect(edges.find((edge) => edge.line === 10)?.assignedTo).toBe("user");
		});

		it("leaves assignedTo null for a destructured declaration", () => {
			const edges = outgoingOf(nodeFor(`${META}annotated`).id);
			expect(edges.find((edge) => edge.line === 11)?.assignedTo).toBeNull();
		});
	});
});
