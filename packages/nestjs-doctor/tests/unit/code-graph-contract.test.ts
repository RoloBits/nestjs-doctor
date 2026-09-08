import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type {
	BodyItem,
	CallEdge,
	CodeGraph,
	MethodNode,
	NodeId,
} from "../../src/common/code-graph.js";
import { indexNodes, reachableFrom } from "../../src/common/code-graph.js";
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
const BY_ID = indexNodes(GRAPH);

const PLACE = "/orders.service.ts::OrdersService#place";
const FIND = "/orders.service.ts::OrdersService#find";
const LABEL = "/orders.service.ts::OrdersService#label";
const RECORD = "/audit.service.ts::AuditService#record";
const SEND = "/notify.service.ts::NotifyService#send";
const REPO_FIND = "/orders.repo.ts::OrdersRepo#findOne";
const REPO_SAVE = "/orders.repo.ts::OrdersRepo#save";
const EACH = "/orders.repo.ts::OrdersRepo#each";
const ALL = "/orders.repo.ts::OrdersRepo#all";
const BOTH = "/orders.repo.ts::OrdersRepo#both";
const DB_FIND = "/prisma.service.ts::PrismaService#user.findUnique";
const DB_UPDATE = "/prisma.service.ts::PrismaService#user.update";
const STAMP = "/external.service.ts::ExternalService#stamp";
const OTHER_STAMP = "/other.service.ts::OtherService#stamp";

function node(id: NodeId): MethodNode {
	const found = BY_ID.get(id);
	if (!found) {
		throw new Error(`no node ${id}`);
	}
	return found;
}

function out(id: NodeId): CallEdge[] {
	return GRAPH.edges
		.filter((edge) => edge.from === id)
		.sort((a, b) => a.order - b.order);
}

function edgeTo(from: NodeId, to: NodeId, line: number): CallEdge {
	const found = out(from).find((edge) => edge.to === to && edge.line === line);
	if (!found) {
		throw new Error(`no edge ${from} -> ${to} at line ${line}`);
	}
	return found;
}

/** Every ordered thing a method does, calls and body items in one sequence. */
function sequence(id: NodeId): { order: number; what: string }[] {
	const items = [
		...node(id).body.map((item) => ({ order: item.order, what: item.kind })),
		...out(id).map((edge) => ({ order: edge.order, what: `call ${edge.to}` })),
	];
	return items.sort((a, b) => a.order - b.order);
}

/**
 * The conditions enclosing a call, outermost first. Reads the one condition the
 * graph records today; the branch table of work step 1 replaces this body.
 */
function conditionsAround(edge: CallEdge): string[] {
	return edge.conditionText ? [edge.conditionText] : [];
}

/** Every way control leaves a method: a throw, a return, a guard clause. */
function exits(id: NodeId): BodyItem[] {
	return node(id).body.filter((item) => item.kind === "throw");
}

/** Whether the call site awaits its callee. No field carries this yet. */
function isAwaited(_edge: CallEdge): boolean | undefined {
	return undefined;
}

/** The try block covering a call, and the catch that would handle it. */
function tryRegionOf(_edge: CallEdge): string | null {
	return null;
}

describe("code graph contract", () => {
	describe("1. what happens first, second, third", () => {
		it("puts every call and body item of one method in one dense sequence", () => {
			expect(sequence(PLACE).map((item) => item.order)).toEqual([
				0, 1, 2, 3, 4, 5, 6, 7, 8,
			]);
		});

		it.fails("runs an argument call before the call it is an argument to", () => {
			// `this.repo.save(this.repo.findOne(...))` evaluates findOne first.
			// Work step 6: sort by node end instead of node start.
			expect(out(LABEL).map((edge) => edge.to)).toEqual([REPO_FIND, REPO_SAVE]);
		});
	});

	describe("2. always reached, or only under a condition", () => {
		it("marks a call inside an if and names the condition", () => {
			const edge = edgeTo(PLACE, REPO_SAVE, 34);
			expect(edge.conditional).toBe(true);
			expect(edge.conditionText).toBe("id === 'x'");
		});

		it("leaves an unconditional call unmarked", () => {
			expect(edgeTo(PLACE, REPO_FIND, 28).conditional).toBe(false);
		});
	});

	describe("3. which steps are mutually exclusive arms of one decision", () => {
		it.fails("gives the three arms of one if chain one group", () => {
			// The chain opens at line 32. Today the arms report L33, L32 and L36.
			// Work step 7: walk to the outermost if of the chain.
			const arms = [
				edgeTo(PLACE, REPO_SAVE, 34),
				edgeTo(PLACE, SEND, 37),
				edgeTo(PLACE, REPO_FIND, 39),
			];
			expect(new Set(arms.map((edge) => edge.branchGroupId)).size).toBe(1);
		});

		it.fails("does not label an else arm with the condition that skips it", () => {
			// The else runs when `id === 'y'` is false, and reports it as the reason.
			const otherwise = edgeTo(PLACE, REPO_FIND, 39);
			expect(otherwise.branchKind).toBe("else");
			expect(otherwise.conditionText).not.toBe("id === 'y'");
		});
	});

	describe("4. which conditions is a step nested inside", () => {
		it.fails("keeps every enclosing condition, outermost first", () => {
			// Work step 1: collect the whole path instead of the innermost only.
			expect(conditionsAround(edgeTo(PLACE, REPO_SAVE, 34))).toEqual([
				"retry",
				"id === 'x'",
			]);
		});
	});

	describe("5. does control leave here", () => {
		it("records a throw as a body item", () => {
			const thrown = exits(PLACE);
			expect(thrown).toHaveLength(1);
			expect(thrown[0].line).toBe(44);
		});

		it.fails("records an early return and the final return", () => {
			// `return null` at line 30 and `return order` at line 52 produce nothing.
			// Work step 2: emit a return item per exit.
			expect(exits(PLACE).map((item) => item.line)).toEqual([30, 44, 52]);
		});
	});

	describe("6. where can it fail, and with what exception", () => {
		it("names the exception class and message of a throw", () => {
			const thrown = exits(PLACE)[0];
			expect(thrown.kind).toBe("throw");
			expect(thrown.kind === "throw" && thrown.exceptionClass).toBe(
				"NotFoundException"
			);
			expect(thrown.kind === "throw" && thrown.message).toBe("order vanished");
		});

		it.fails("keeps a throw that was merged into a guard annotation", () => {
			// `find` throws NotFoundException, and the merge deletes the body item.
			// Work step 8: emit both and let a consumer pattern-match them.
			expect(exits(FIND)).toHaveLength(1);
		});
	});

	describe("7. is a call awaited or fire and forget", () => {
		it.fails("separates an awaited call from a floating one", () => {
			// Line 28 is awaited, line 48 is not. Work step 4.
			expect(isAwaited(edgeTo(PLACE, REPO_FIND, 28))).toBe(true);
			expect(isAwaited(edgeTo(PLACE, SEND, 48))).toBe(false);
		});
	});

	describe("8. does it run once, per item, or concurrently", () => {
		it("marks a call in a for-of loop", () => {
			const edge = out(EACH)[0];
			expect(edge.iterationKind).toBe("loop");
			expect(edge.iterationLabel).toBe("for-of");
		});

		it("marks a call in a callback", () => {
			expect(out(ALL)[0].iterationKind).toBe("callback");
		});

		it("marks calls raced by Promise.all", () => {
			expect(out(BOTH).map((edge) => edge.iterationKind)).toEqual([
				"concurrent",
				"concurrent",
			]);
		});

		it("leaves a plain call unmarked", () => {
			expect(edgeTo(PLACE, REPO_FIND, 28).iterationKind).toBeNull();
		});
	});

	describe("9. what does it call, and where is that callee's flow", () => {
		it("resolves every edge endpoint and every entry to a node", () => {
			for (const edge of GRAPH.edges) {
				expect(BY_ID.has(edge.from)).toBe(true);
				expect(BY_ID.has(edge.to)).toBe(true);
			}
			for (const entry of GRAPH.entries) {
				expect(BY_ID.has(entry.node)).toBe(true);
			}
		});

		it.fails("makes a self-recursive call an edge back to the same node", () => {
			// `this.place(id, false)` at line 49. Work step 5.
			expect(out(PLACE).some((edge) => edge.to === PLACE)).toBe(true);
		});

		it.fails("makes an inherited same-class call an edge", () => {
			// `this.record('placed')` at line 47 resolves to AuditService. Work step 5.
			expect(out(PLACE).some((edge) => edge.to === RECORD)).toBe(true);
		});

		it.fails("makes a super call an edge", () => {
			// `super.record('audited')` at line 48. Work step 5.
			expect(
				out(PLACE).filter((edge) => edge.to === RECORD).length
			).toBeGreaterThan(1);
		});

		it("drops a static call and a bare function call", () => {
			// `Mailer.send(id)` and `helper(1)` produce no edge. Whether project
			// functions become nodes is the plan's one open decision, not a defect.
			const lines = out(PLACE).map((edge) => edge.line);
			expect(lines).not.toContain(45);
			expect(lines).not.toContain(46);
		});
	});

	describe("10. which endpoints reach a method", () => {
		it("reaches one shared service from all three entries", () => {
			const perEntry = GRAPH.entries.filter((entry) =>
				reachableFrom(GRAPH, [entry.node]).has(SEND)
			);
			expect(perEntry).toHaveLength(3);
		});

		it("gives two endpoints reaching one method a single node", () => {
			expect(GRAPH.nodes.filter((item) => item.id === SEND)).toHaveLength(1);
			expect(GRAPH.edges.filter((edge) => edge.to === SEND).length).toBe(5);
		});
	});

	describe("11. what does it read and write", () => {
		it("names the collection and the operation of a data call", () => {
			expect(node(DB_FIND).kind).toBe("db");
			expect(node(DB_FIND).member).toBe("user");
			expect(node(DB_FIND).methodName).toBe("findUnique");
			expect(node(DB_UPDATE).methodName).toBe("update");
		});
	});

	describe("12. is a call resolved, or a black box, and why", () => {
		it("says an npm package callee is external", () => {
			const external = out(STAMP).map((edge) => node(edge.to));
			expect(external.map((item) => item.unresolved)).toContain(
				"external-package"
			);
		});

		it("says an injection token callee is an interface", () => {
			expect(node(out(OTHER_STAMP)[0].to).unresolved).toBe("interface-token");
		});

		it.fails("keeps two same-named interfaces in different files apart", () => {
			// Both Clock interfaces get an empty file path, so they collide.
			// Work step 9: give an interface token its declaration path.
			expect(out(STAMP)[0].to).not.toBe(out(OTHER_STAMP)[0].to);
		});
	});

	describe("13. is this method's flow complete", () => {
		it.fails("numbers every method's sequence 0 to n-1 with no holes", () => {
			// `find` yields [0, 2]: order 1 was the throw the guard merge deleted.
			// Work steps 6 and 8.
			const holes = GRAPH.nodes
				.map((item) => sequence(item.id))
				.filter((items) => items.some((entry, index) => entry.order !== index));
			expect(holes).toEqual([]);
		});
	});

	describe("14. where in source", () => {
		it("spans a declared method from its first line to its last", () => {
			expect(node(PLACE).line).toBe(26);
			expect(node(PLACE).endLine).toBe(53);
			expect(node(PLACE).filePath).toBe("/orders.service.ts");
		});

		it("leaves a synthetic node without a source position", () => {
			// A db node and an unresolved node describe a callee with no declaration.
			expect(node(DB_FIND).line).toBe(0);
		});
	});

	describe("15. what kind of thing is this", () => {
		it("kinds a controller, a service, a repository and a data call", () => {
			expect(node("/orders.controller.ts::OrdersController#create").kind).toBe(
				"controller"
			);
			expect(node(SEND).kind).toBe("service");
			expect(node(REPO_FIND).kind).toBe("repository");
			expect(node(DB_FIND).kind).toBe("db");
		});
	});

	describe("16. what did the author say the step is for", () => {
		it("carries the comment above a call", () => {
			expect(edgeTo(PLACE, REPO_FIND, 28).comment).toBe(
				"look the order up before anything else"
			);
		});

		it("names the variable a call is assigned to", () => {
			expect(edgeTo(PLACE, REPO_FIND, 28).assignedTo).toBe("order");
		});
	});

	describe("17. signature and HTTP contract", () => {
		it("carries the parameters and return type of a method", () => {
			expect(node(PLACE).parameters.map((param) => param.name)).toEqual([
				"id",
				"retry",
			]);
			expect(node(LABEL).returnType).toBe("string");
		});

		it("indexes an overloaded method once, at its implementation", () => {
			expect(GRAPH.nodes.filter((item) => item.id === LABEL)).toHaveLength(1);
			expect(node(LABEL).line).toBe(66);
			expect(node(LABEL).parameters[0].type).toBe("string | number");
		});

		it("carries the method and path of every endpoint", () => {
			expect(
				GRAPH.entries.map((entry) => `${entry.httpMethod} ${entry.routePath}`)
			).toEqual(["POST /admin/ping", "POST /orders", "GET /orders/:id"]);
		});
	});

	describe("18. is a call inside a try, and which catch covers it", () => {
		it("marks the throw inside a catch clause", () => {
			expect(exits(PLACE)[0].branchKind).toBe("catch");
		});

		it.fails("links a call in a try to the catch that covers it", () => {
			// Line 42 sits in the try whose catch throws at line 44, and reads as
			// sequential. Work step 3.
			expect(tryRegionOf(edgeTo(PLACE, REPO_SAVE, 42))).toBe("L41");
		});
	});
});
