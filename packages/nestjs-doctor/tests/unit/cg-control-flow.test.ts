import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type {
	BodyItem,
	CallEdge,
	CodeGraph,
} from "../../src/common/code-graph.js";
import {
	buildAnalysisContext,
	codeGraphFor,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-control-flow");

describe("code graph control-flow annotation", () => {
	let graph: CodeGraph;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		graph = codeGraphFor(await buildAnalysisContext(FIXTURE, scanConfig));
	});

	/** The single edge whose callee is `DepService#<name>`. */
	function edgeTo(name: string): CallEdge {
		const found = graph.edges.filter((edge) =>
			edge.to.endsWith(`::DepService#${name}`)
		);
		expect(found, `edges to DepService#${name}`).toHaveLength(1);
		return found[0] as CallEdge;
	}

	function bodyOf(method: string): BodyItem[] {
		const node = graph.nodes.find((candidate) =>
			candidate.id.endsWith(`::FlowController#${method}`)
		);
		expect(node, `node FlowController#${method}`).toBeDefined();
		return node?.body ?? [];
	}

	function itemAt(method: string, line: number): BodyItem {
		const found = bodyOf(method).filter((item) => item.line === line);
		expect(found, `body items of ${method} at line ${line}`).toHaveLength(1);
		return found[0] as BodyItem;
	}

	describe("conditions", () => {
		it("annotates a plain if", () => {
			const edge = edgeTo("ifOnly");
			expect(edge.conditional).toBe(true);
			expect(edge.branchKind).toBe("if");
			expect(edge.conditionText).toBe("flag");
			expect(edge.branchGroupId).toBe("L10");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "flag", statementLine: 10 },
			]);
			expect(edge.tryRegion).toBeNull();
			expect(edge.iterationKind).toBeNull();
		});

		it("pairs a two-arm if/else under one group", () => {
			const ifArm = edgeTo("twoArmIf");
			const elseArm = edgeTo("twoArmElse");
			expect(ifArm.branchKind).toBe("if");
			expect(elseArm.branchKind).toBe("else");
			expect(ifArm.branchGroupId).toBe("L17");
			expect(elseArm.branchGroupId).toBe("L17");
			expect(elseArm.conditionText).toBe("flag");
			expect(elseArm.conditional).toBe(true);
		});

		it("keeps if/else-if/else in one group with a null tail condition", () => {
			const first = edgeTo("chainIf");
			const middle = edgeTo("chainElseIf");
			const tail = edgeTo("chainElse");
			expect(first.branchGroupId).toBe("L26");
			expect(middle.branchGroupId).toBe("L26");
			expect(tail.branchGroupId).toBe("L26");
			expect(first.branchKind).toBe("if");
			expect(middle.branchKind).toBe("else-if");
			expect(tail.branchKind).toBe("else");
			expect(first.conditionText).toBe("n === 1");
			expect(middle.conditionText).toBe("n === 2");
			expect(tail.conditionText).toBeNull();
		});

		it("gives an else-if arm one frame, not a nested else", () => {
			expect(edgeTo("chainElseIf").conditionPath).toEqual([
				{ branchKind: "else-if", conditionText: "n === 2", statementLine: 26 },
			]);
		});

		it("keeps a four-arm chain in one group", () => {
			const arms = [
				edgeTo("q1"),
				edgeTo("q2"),
				edgeTo("q3"),
				edgeTo("q4"),
			] as const;
			for (const arm of arms) {
				expect(arm.branchGroupId).toBe("L37");
			}
			expect(arms.map((arm) => arm.branchKind)).toEqual([
				"if",
				"else-if",
				"else-if",
				"else",
			]);
		});

		it("records nested ifs outermost first", () => {
			const edge = edgeTo("nested2");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "a", statementLine: 50 },
				{ branchKind: "if", conditionText: "b", statementLine: 51 },
			]);
			expect(edge.conditionText).toBe("b");
			expect(edge.branchGroupId).toBe("L51");
		});

		it("records three levels of nesting in order", () => {
			const edge = edgeTo("nested3");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "a", statementLine: 59 },
				{ branchKind: "if", conditionText: "b", statementLine: 60 },
				{ branchKind: "if", conditionText: "c", statementLine: 61 },
			]);
			expect(edge.conditionText).toBe("c");
			expect(edge.branchGroupId).toBe("L61");
		});

		it("annotates switch cases and the default arm", () => {
			const caseA = edgeTo("caseA");
			const caseB = edgeTo("caseB");
			const fallback = edgeTo("defaultArm");
			expect(caseA.branchKind).toBe("case");
			expect(caseB.branchKind).toBe("case");
			expect(fallback.branchKind).toBe("default");
			expect(caseA.branchGroupId).toBe("L70");
			expect(caseB.branchGroupId).toBe("L70");
			expect(fallback.branchGroupId).toBe("L70");
			expect(caseA.conditionText).toBe("1");
			expect(fallback.conditionText).toBeNull();
		});

		it("annotates both ternary arms", () => {
			const truthy = edgeTo("ternTrue");
			const falsy = edgeTo("ternFalse");
			expect(truthy.branchKind).toBe("ternary-true");
			expect(falsy.branchKind).toBe("ternary-false");
			expect(truthy.conditionText).toBe("flag");
			expect(falsy.conditionText).toBe("flag");
			expect(truthy.branchGroupId).toBe(falsy.branchGroupId);
		});

		it("annotates braceless arms", () => {
			const ifArm = edgeTo("bracelessIf");
			const elseArm = edgeTo("bracelessElse");
			expect(ifArm.branchKind).toBe("if");
			expect(elseArm.branchKind).toBe("else");
			expect(ifArm.branchGroupId).toBe("L315");
			expect(elseArm.branchGroupId).toBe("L315");
		});

		it("stacks a ternary frame on top of an if", () => {
			expect(edgeTo("ternInIfTrue").conditionPath).toEqual([
				{ branchKind: "if", conditionText: "flag", statementLine: 260 },
				{
					branchKind: "ternary-true",
					conditionText: "other",
					statementLine: 261,
				},
			]);
		});

		it("leaves an unconditional call bare", () => {
			const edge = edgeTo("plain");
			expect(edge.conditional).toBe(false);
			expect(edge.conditionPath).toEqual([]);
			expect(edge.branchGroupId).toBeNull();
			expect(edge.branchKind).toBeNull();
			expect(edge.conditionText).toBeNull();
			expect(edge.tryRegion).toBeNull();
		});

		it("leaves a call that computes a condition unconditional", () => {
			for (const name of ["checkIf", "pick", "cond"]) {
				const edge = edgeTo(name);
				expect(edge.conditional, name).toBe(false);
				expect(edge.branchKind, name).toBeNull();
				expect(edge.conditionPath, name).toEqual([]);
			}
			expect(edgeTo("insideIf").conditionText).toBe("this.dep.checkIf()");
		});

		// A statement shared by two case clauses is attributed only to the last
		// one, so the `case 1` path it also runs on goes unrecorded.
		it("attributes a fallthrough body to the nearest case clause", () => {
			const edge = edgeTo("fallThrough");
			expect(edge.branchKind).toBe("case");
			expect(edge.conditionText).toBe("2");
			expect(edge.branchGroupId).toBe("L268");
		});

		// A short-circuit operand is a guarded call the model has no branch kind
		// for, so it reads as unconditional.
		it("does not treat a && operand as conditional", () => {
			const edge = edgeTo("shortCircuitCall");
			expect(edge.conditional).toBe(false);
			expect(edge.conditionPath).toEqual([]);
		});

		// Defect: two decisions opening on one line share an `L<line>` group, so
		// the arms of two nested ternaries collapse into one group that holds two
		// "ternary-true" arms.
		// Known limitation: a branch group is `L<line>`, so two constructs opening on
		// one line share one id. `conditionPath` separates them; prefer it.
		it.fails("gives same-line nested ternaries distinct groups", () => {
			expect(edgeTo("tern1").branchGroupId).not.toBe(
				edgeTo("tern2").branchGroupId
			);
		});
	});

	describe("try regions", () => {
		it("marks a call in a guarded try body", () => {
			const edge = edgeTo("inTry");
			expect(edge.tryRegion).toBe("L94");
			expect(edge.conditional).toBe(false);
			expect(edge.branchKind).toBeNull();
			expect(edge.conditionPath).toEqual([]);
		});

		it("pairs the catch arm with the try region", () => {
			const edge = edgeTo("inCatch");
			expect(edge.branchKind).toBe("catch");
			expect(edge.branchGroupId).toBe("L94");
			expect(edge.conditional).toBe(true);
			expect(edge.conditionText).toBeNull();
			expect(edge.tryRegion).toBeNull();
		});

		it("leaves a finally body outside the try region", () => {
			const edge = edgeTo("inFinally");
			expect(edge.tryRegion).toBeNull();
			expect(edge.conditional).toBe(false);
			expect(edge.branchKind).toBeNull();
		});

		it("gives a try with only a finally no region", () => {
			expect(edgeTo("bareFinallyBody").tryRegion).toBeNull();
			expect(edgeTo("bareFinallyTail").tryRegion).toBeNull();
		});

		it("populates both region and condition path for a try inside an if", () => {
			const edge = edgeTo("tryInsideIf");
			expect(edge.tryRegion).toBe("L115");
			expect(edge.conditional).toBe(true);
			expect(edge.branchKind).toBe("if");
			expect(edge.branchGroupId).toBe("L114");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "flag", statementLine: 114 },
			]);
		});

		it("stacks a catch frame on top of the enclosing if", () => {
			const edge = edgeTo("catchInsideIf");
			expect(edge.branchKind).toBe("catch");
			expect(edge.branchGroupId).toBe("L115");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "flag", statementLine: 114 },
				{ branchKind: "catch", conditionText: null, statementLine: 115 },
			]);
		});

		it("takes the innermost try and keeps an outer one covering a catch", () => {
			expect(edgeTo("innerTry").tryRegion).toBe("L281");
			const innerCatch = edgeTo("innerCatch");
			expect(innerCatch.branchGroupId).toBe("L281");
			expect(innerCatch.tryRegion).toBe("L280");
			const outerCatch = edgeTo("outerCatch");
			expect(outerCatch.branchGroupId).toBe("L280");
			expect(outerCatch.tryRegion).toBeNull();
		});
	});

	describe("iteration", () => {
		it("labels a for-of loop", () => {
			const edge = edgeTo("forOf");
			expect(edge.iterationKind).toBe("loop");
			expect(edge.iterationLabel).toBe("for-of");
			expect(edge.conditional).toBe(false);
		});

		it("labels the classic loop forms", () => {
			expect(edgeTo("classicFor").iterationKind).toBe("loop");
			expect(edgeTo("classicFor").iterationLabel).toBe("for");
			expect(edgeTo("whileCall").iterationKind).toBe("loop");
			expect(edgeTo("whileCall").iterationLabel).toBe("while");
			expect(edgeTo("doWhileCall").iterationKind).toBe("loop");
			expect(edgeTo("doWhileCall").iterationLabel).toBe("do-while");
		});

		it("labels array callbacks", () => {
			expect(edgeTo("mapped").iterationKind).toBe("callback");
			expect(edgeTo("mapped").iterationLabel).toBe("map");
			expect(edgeTo("eached").iterationKind).toBe("callback");
			expect(edgeTo("eached").iterationLabel).toBe("forEach");
			expect(edgeTo("filtered").iterationKind).toBe("callback");
			expect(edgeTo("filtered").iterationLabel).toBe("filter");
			expect(edgeTo("reducedCall").iterationLabel).toBe("reduce");
		});

		it("leaves a non-iteration callback unlabelled", () => {
			const edge = edgeTo("deferredCall");
			expect(edge.iterationKind).toBeNull();
			expect(edge.iterationLabel).toBeNull();
		});

		it("labels Promise.all as concurrent, awaited or not", () => {
			for (const edge of [edgeTo("allA"), edgeTo("allB")]) {
				expect(edge.iterationKind).toBe("concurrent");
				expect(edge.iterationLabel).toBe("all");
				expect(edge.awaited).toBe(false);
			}
			expect(edgeTo("unawaitedAllA").iterationKind).toBe("concurrent");
		});

		it("takes the innermost context for Promise.all over a map", () => {
			const edge = edgeTo("allMapped");
			expect(edge.iterationKind).toBe("callback");
			expect(edge.iterationLabel).toBe("map");
		});

		it("keeps the condition path across an iteration callback", () => {
			const edge = edgeTo("callbackInIfCall");
			expect(edge.iterationLabel).toBe("map");
			expect(edge.conditionPath).toEqual([
				{ branchKind: "if", conditionText: "flag", statementLine: 336 },
			]);
		});

		it("carries a loop and a condition together", () => {
			const edge = edgeTo("ifInLoop");
			expect(edge.iterationKind).toBe("loop");
			expect(edge.iterationLabel).toBe("for-of");
			expect(edge.branchKind).toBe("if");
			expect(edge.branchGroupId).toBe("L252");
		});

		// Defect: LOOP_LABEL_MAP keys on ForOfStatement without checking the await
		// modifier, so a sequential `for await` is indistinguishable from `for of`.
		it("distinguishes for-await-of from for-of", () => {
			expect(edgeTo("forAwaitCall").iterationLabel).toBe("for-await-of");
		});
	});

	describe("await", () => {
		it("marks an awaited call", () => {
			expect(edgeTo("awaitedCall").awaited).toBe(true);
		});

		it("leaves a bare call unawaited", () => {
			expect(edgeTo("bareCall").awaited).toBe(false);
		});

		it("leaves a returned promise unawaited", () => {
			expect(edgeTo("returnedCall").awaited).toBe(false);
		});

		it("sees through an as-cast and a non-null assertion", () => {
			expect(edgeTo("castAwait").awaited).toBe(true);
			expect(edgeTo("bangAwait").awaited).toBe(true);
		});

		it("marks a call awaited inside an iteration callback", () => {
			const edge = edgeTo("awaitedInMap");
			expect(edge.awaited).toBe(true);
			expect(edge.iterationLabel).toBe("map");
		});
	});

	describe("body items", () => {
		it("annotates a throw inside a catch", () => {
			const item = itemAt("throwInCatch", 215);
			expect(item.kind).toBe("throw");
			expect(item.branchKind).toBe("catch");
			expect(item.branchGroupId).toBe("L212");
			expect(item.conditional).toBe(true);
			expect(item.tryRegion).toBeNull();
			expect(item.conditionPath).toEqual([
				{ branchKind: "catch", conditionText: null, statementLine: 212 },
			]);
		});

		it("annotates an early return inside an if", () => {
			const item = itemAt("returnInIf", 222);
			expect(item.kind).toBe("return");
			expect(item.branchKind).toBe("if");
			expect(item.conditionText).toBe("flag");
			expect(item.branchGroupId).toBe("L221");
			expect(item.conditional).toBe(true);
		});

		it("leaves the final return unconditional", () => {
			const item = itemAt("returnInIf", 224);
			expect(item.kind).toBe("return");
			expect(item.conditional).toBe(false);
			expect(item.conditionPath).toEqual([]);
			expect(item.branchGroupId).toBeNull();
		});

		it("annotates a return inside a case clause", () => {
			const item = itemAt("callInDiscriminant", 238);
			expect(item.kind).toBe("return");
			expect(item.branchKind).toBe("case");
			expect(item.branchGroupId).toBe("L236");
		});
	});
});
