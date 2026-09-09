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
const HELPER = "/orders.service.ts::#helper";
const MAILER_SEND = "/orders.service.ts::Mailer.send";
const WRAPPED_CREATE = "/wrapped.controller.ts::WrappedController#create";

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

/** The conditions enclosing a call, outermost first. */
function conditionsAround(edge: CallEdge): string[] {
	return edge.conditionPath.map(
		(frame) => frame.conditionText ?? frame.branchKind
	);
}

/** Every way control leaves a method: a throw, a return, a guard clause. */
function exits(id: NodeId): BodyItem[] {
	return node(id)
		.body.filter((item) => item.kind === "throw" || item.kind === "return")
		.sort((a, b) => a.order - b.order);
}

/** Whether the call site awaits its callee. */
function isAwaited(edge: CallEdge): boolean {
	return edge.awaited;
}

/** The try block covering a call, and the catch that would handle it. */
function tryRegionOf(edge: CallEdge): string | null {
	return edge.tryRegion;
}

describe("code graph contract", () => {
	describe("1. what happens first, second, third", () => {
		it("puts every call and body item of one method in one dense sequence", () => {
			expect(sequence(PLACE).map((item) => item.order)).toEqual([
				0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
			]);
		});

		it("runs an argument call before the call it is an argument to", () => {
			// `this.repo.save(this.repo.findOne(...))` evaluates findOne first.
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
		it("gives every arm of one if chain the same group", () => {
			// The chain opens at line 32. The save at 34 sits a level deeper, inside
			// its own if, so its own arm is the outermost frame of its path.
			const arms = [
				edgeTo(PLACE, REPO_SAVE, 34),
				edgeTo(PLACE, SEND, 37),
				edgeTo(PLACE, REPO_FIND, 39),
			];
			expect(arms.map((edge) => edge.conditionPath[0].statementLine)).toEqual([
				32, 32, 32,
			]);
			expect(arms.map((edge) => edge.conditionPath[0].branchKind)).toEqual([
				"if",
				"else-if",
				"else",
			]);
		});

		it("gives a nested decision its own group", () => {
			expect(edgeTo(PLACE, REPO_SAVE, 34).branchGroupId).toBe("L33");
		});

		it("does not label an else arm with a condition that skips it", () => {
			// The else runs when both `retry` and `id === 'y'` are false, so no one
			// condition describes it.
			const otherwise = edgeTo(PLACE, REPO_FIND, 39);
			expect(otherwise.branchKind).toBe("else");
			expect(otherwise.conditionText).toBeNull();
		});
	});

	describe("4. which conditions is a step nested inside", () => {
		it("keeps every enclosing condition, outermost first", () => {
			expect(conditionsAround(edgeTo(PLACE, REPO_SAVE, 34))).toEqual([
				"retry",
				"id === 'x'",
			]);
		});

		it("leaves the path empty for an unconditional call", () => {
			expect(conditionsAround(edgeTo(PLACE, REPO_FIND, 28))).toEqual([]);
		});
	});

	describe("5. does control leave here", () => {
		it("records an early return, a throw and the final return in order", () => {
			expect(exits(PLACE).map((item) => item.line)).toEqual([30, 44, 52]);
			expect(exits(PLACE).map((item) => item.kind)).toEqual([
				"return",
				"throw",
				"return",
			]);
		});

		it("carries the returned expression, and marks an early return conditional", () => {
			const early = exits(PLACE)[0];
			expect(early.kind === "return" && early.expression).toBe("null");
			expect(early.conditional).toBe(true);
			expect(exits(PLACE)[2].conditional).toBe(false);
		});

		it("ignores a return belonging to a nested callback", () => {
			// `ids.map((id) => this.prisma...)` returns from the arrow, not from `all`.
			expect(exits(ALL)).toHaveLength(1);
			expect(exits(ALL)[0].line).toBe(24);
		});
	});

	describe("6. where can it fail, and with what exception", () => {
		it("names the exception class and message of a throw", () => {
			const thrown = exits(PLACE)[1];
			expect(thrown.kind).toBe("throw");
			expect(thrown.kind === "throw" && thrown.exceptionClass).toBe(
				"NotFoundException"
			);
			expect(thrown.kind === "throw" && thrown.message).toBe("order vanished");
		});

		it("keeps a throw that was merged into a guard annotation", () => {
			// `find` fetches, null-checks and throws. The edge carries the merged
			// guard and the body still carries the throw, flagged as the same one.
			const thrown = exits(FIND).filter((item) => item.kind === "throw");
			expect(thrown).toHaveLength(1);
			expect(thrown[0].kind === "throw" && thrown[0].mergedIntoCall).toBe(true);
			expect(edgeTo(FIND, REPO_FIND, 56).guardThrow?.className).toBe(
				"NotFoundException"
			);
		});

		it("does not flag a throw the merge left alone", () => {
			const thrown = exits(PLACE)[1];
			expect(thrown.kind === "throw" && thrown.mergedIntoCall).toBe(false);
		});
	});

	describe("7. is a call awaited or fire and forget", () => {
		it("separates an awaited call from a floating one", () => {
			expect(isAwaited(edgeTo(PLACE, REPO_FIND, 28))).toBe(true);
			expect(isAwaited(edgeTo(PLACE, SEND, 48))).toBe(false);
		});

		it("reads a call collected by Promise.all as not awaited itself", () => {
			// The await sits on Promise.all, so iterationKind carries the collection.
			const raced = out(BOTH)[0];
			expect(isAwaited(raced)).toBe(false);
			expect(raced.iterationKind).toBe("concurrent");
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

		it("makes a self-recursive call an edge back to the same node", () => {
			expect(edgeTo(PLACE, PLACE, 51).to).toBe(PLACE);
		});

		it("points an inherited call and a super call at the one declaration", () => {
			// `this.record()` at 49 and `super.record()` at 50 both resolve to
			// AuditService, which declares the method.
			const inherited = out(PLACE).filter((edge) => edge.to === RECORD);
			expect(inherited.map((edge) => edge.line)).toEqual([49, 50]);
			expect(node(RECORD).filePath).toBe("/audit.service.ts");
		});

		it("reaches a bare call and a static call this project declares", () => {
			// `helper(1)` at 47 and `Mailer.send(id)` at 46, neither injected.
			expect(edgeTo(PLACE, HELPER, 47).to).toBe(HELPER);
			expect(edgeTo(PLACE, MAILER_SEND, 46).to).toBe(MAILER_SEND);
			expect(node(HELPER).kind).toBe("function");
			expect(node(MAILER_SEND).kind).toBe("function");
		});

		it("keeps a static apart from an instance method of the same name", () => {
			expect(node(MAILER_SEND).isStatic).toBe(true);
			expect(node(SEND).isStatic).toBeUndefined();
			expect(MAILER_SEND).not.toBe(SEND);
		});
	});

	describe("10. which endpoints reach a method", () => {
		it("reaches one shared service from every entry", () => {
			const perEntry = GRAPH.entries.filter((entry) =>
				reachableFrom(GRAPH, [entry.node]).has(SEND)
			);
			expect(perEntry).toHaveLength(GRAPH.entries.length);
		});

		it("gives two endpoints reaching one method a single node", () => {
			expect(GRAPH.nodes.filter((item) => item.id === SEND)).toHaveLength(1);
			expect(GRAPH.edges.filter((edge) => edge.to === SEND).length).toBe(6);
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

		it("keeps two same-named interfaces in different files apart", () => {
			expect(out(STAMP)[0].to).not.toBe(out(OTHER_STAMP)[0].to);
			expect(node(out(STAMP)[0].to).filePath).toBe("/tokens.ts");
			expect(node(out(OTHER_STAMP)[0].to).filePath).toBe("/other-tokens.ts");
		});
	});

	describe("13. is this method's flow complete", () => {
		it("numbers every method's sequence 0 to n-1 with no holes", () => {
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
		it("kinds a controller declared by a wrapper decorator", () => {
			// `@ApiController()` composes `Controller()`, so its name is not literally
			// Controller and a name match would read the class as a service.
			expect(node(WRAPPED_CREATE).kind).toBe("controller");
		});

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
			).toEqual([
				"POST /admin/ping",
				"POST /orders",
				"GET /orders/:id",
				"POST /wrapped",
			]);
		});
	});

	describe("18. is a call inside a try, and which catch covers it", () => {
		it("marks the throw inside a catch clause", () => {
			expect(exits(PLACE)[1].branchKind).toBe("catch");
		});

		it("links a call in a try to the catch that covers it", () => {
			const covered = edgeTo(PLACE, REPO_SAVE, 42);
			expect(tryRegionOf(covered)).toBe("L41");
			expect(exits(PLACE)[1].branchGroupId).toBe("L41");
		});

		it("leaves a call outside any try uncovered", () => {
			expect(tryRegionOf(edgeTo(PLACE, REPO_FIND, 28))).toBeNull();
		});
	});
});
