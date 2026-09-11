import { describe, expect, it } from "vitest";
import {
	buildEndpoint,
	buildEndpoints,
	CATEGORIES,
	categoryCounts,
	dbOperation,
	keptSteps,
	presetState,
	stepCategory,
	stepFlags,
} from "../../src/report/ui/app/lib/descent-walk.js";
import { DESCENT_GRAPH } from "./report-artifact-fixture.js";

const first = () =>
	buildEndpoint(DESCENT_GRAPH, DESCENT_GRAPH.entries[0] as never);

const labels = () => {
	const ep = first();
	return ep.walk.map((step) => ep.nodes[step.node]?.label);
};

describe("descent walk", () => {
	it("walks depth-first in source order, with a known step count", () => {
		expect(labels()).toEqual([
			"AController#handle",
			"AService#load",
			"PrismaService#user.findUnique",
			"AppLogger#log",
			"AService#save",
			"PrismaService#user.update",
			"AService#load",
			"PrismaService#user.findUnique",
			"AppLogger#log",
			"AController#handle",
		]);
	});

	it("is deterministic across runs", () => {
		expect(labels()).toEqual(labels());
	});

	it("emits a back edge without descending into it", () => {
		const ep = first();
		const last = ep.walk.at(-1);

		expect(last?.recursive).toBe(true);
		// The entry is the callee, and nothing follows it in the walk.
		expect(ep.nodes[last?.node ?? -1]?.label).toBe("AController#handle");
		expect(
			ep.walk.filter((step) => step.parent === ep.walk.length - 1)
		).toEqual([]);
	});

	it("marks the second visit to a node as a revisit, not a recursion", () => {
		const ep = first();
		const revisit = ep.walk[6];

		expect(revisit?.revisit).toBe(true);
		expect(revisit?.recursive).toBe(false);
	});

	it("reconstructs each step's depth from its parent chain", () => {
		const ep = first();
		for (const [index, step] of ep.walk.entries()) {
			let depth = 0;
			let at = step.parent;
			while (at >= 0) {
				depth++;
				at = ep.walk[at]?.parent ?? -1;
			}
			expect(depth, `step ${index}`).toBe(step.depth);
		}
	});

	it("tiers nodes by call depth, ordered by the step that reaches them", () => {
		const ep = first();
		const tier = (index: number) =>
			ep.tiers[index]?.map((node) => ep.nodes[node]?.label);

		expect(ep.depths).toEqual([0, 1, 2]);
		expect(tier(0)).toEqual(["AController#handle"]);
		expect(tier(1)).toEqual(["AService#load", "AService#save"]);
		expect(tier(2)).toEqual([
			"PrismaService#user.findUnique",
			"AppLogger#log",
			"PrismaService#user.update",
		]);
	});

	it("reads the db direction off the ORM method name", () => {
		expect(dbOperation("findUnique")).toBe("read");
		expect(dbOperation("findMany")).toBe("read");
		expect(dbOperation("count")).toBe("read");
		expect(dbOperation("aggregate")).toBe("read");
		expect(dbOperation("createMany")).toBe("write");
		expect(dbOperation("upsert")).toBe("write");
		expect(dbOperation("deleteMany")).toBe("write");
		expect(dbOperation("$queryRaw")).toBe("other");
	});

	it("says which of the first db read and write came first", () => {
		const verdict = first().verdict;

		expect(verdict.firstRead).toBe(2);
		expect(verdict.firstWrite).toBe(5);
		expect(verdict.reads).toBe(2);
		expect(verdict.writes).toBe(1);
		expect(verdict.text).toBe("read before write · @2 then @5");
	});

	it("says so plainly when the path reaches no db node", () => {
		const ep = buildEndpoints(DESCENT_GRAPH)[1];

		expect(ep?.walk).toHaveLength(1);
		expect(ep?.verdict.text).toBe("no db node on this path");
	});

	it("classifies a logger call as a log, never as an effect", () => {
		const ep = first();
		const log = ep.nodes.find((node) => node.label === "AppLogger#log");

		expect(log && stepCategory(log)).toBe("log");
	});

	it("partitions the walk: the category counts sum to every step", () => {
		const ep = first();
		const counts = categoryCounts(ep);
		const summed = CATEGORIES.reduce((total, cat) => total + counts[cat], 0);

		expect(summed).toBe(ep.walk.length);
		expect(counts.read).toBe(2);
		expect(counts.write).toBe(1);
		expect(counts.log).toBe(2);
		expect(counts.call).toBe(5);
	});

	it("keeps every step under `all` and only db steps under `database`", () => {
		const ep = first();

		expect(keptSteps(ep, presetState(0))).toHaveLength(ep.walk.length);
		expect(keptSteps(ep, presetState(4))).toEqual([2, 5, 7]);
		expect(keptSteps(ep, presetState(3))).toEqual([0, 1, 2, 4, 5, 6, 7, 9]);
	});

	it("carries the call site's own marks onto the step", () => {
		const ep = first();

		expect(stepFlags(ep, ep.walk[3] as never)).toEqual(["not awaited"]);
		expect(stepFlags(ep, ep.walk[4] as never)).toEqual(["cond"]);
		expect(stepFlags(ep, ep.walk[6] as never)).toEqual(["again", "‖"]);
		expect(stepFlags(ep, ep.walk[0] as never)).toEqual([]);
	});
});
