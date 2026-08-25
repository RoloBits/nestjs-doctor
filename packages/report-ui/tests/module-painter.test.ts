import { describe, expect, it } from "vitest";
import {
	blastRadius,
	buildClusters,
	computeLayout,
	formatMs,
	type MgNode,
	reverseIndex,
} from "../src/canvas/module-graph-painter";

const node = (name: string, project = ""): MgNode => ({
	name,
	project,
	filePath: `${project ? `${project}/` : ""}${name}.ts`,
	isGlobal: false,
	imports: [],
	exports: [],
	providers: ["P"],
	controllers: [],
	dynamicImports: null,
	initTimings: null,
	label: name,
	sub: "1p \u00b7 0c",
	x: 0,
	y: 0,
	w: 112,
	h: 40,
});

describe("buildClusters", () => {
	it("groups by project keeping first-seen order", () => {
		const clusters = buildClusters([
			node("B", "api"),
			node("A"),
			node("C", "api"),
		]);
		expect(clusters.map((c) => c.key)).toEqual(["api", ""]);
		expect(clusters[0].nodes.map((n) => n.name)).toEqual(["B", "C"]);
	});
});

describe("computeLayout", () => {
	it("never overlaps nodes inside a cluster and packs clusters apart", () => {
		const modules = [
			node("AppModule"),
			node("AuthModule"),
			node("UsersModule"),
			node("ConfigModule"),
			node("SharedModule"),
			node("LoggingModule"),
		];
		const edges = [
			{ from: "AppModule", to: "AuthModule" },
			{ from: "AppModule", to: "UsersModule" },
			{ from: "AuthModule", to: "ConfigModule" },
			{ from: "UsersModule", to: "SharedModule" },
		];
		const clusters = computeLayout(modules, edges);
		expect(clusters.length).toBeGreaterThan(0);

		const sorted = [...modules].sort((a, b) => a.y - b.y || a.x - b.x);
		for (let i = 1; i < sorted.length; i++) {
			for (let j = 0; j < i; j++) {
				const overlapX =
					Math.abs(sorted[i].x - sorted[j].x) <
					(sorted[i].w + sorted[j].w) / 2 - 0.01;
				const overlapY =
					Math.abs(sorted[i].y - sorted[j].y) <
					(sorted[i].h + sorted[j].h) / 2 - 0.01;
				expect(overlapX && overlapY).toBe(false);
			}
		}
	});

	it("offsets cluster headers into node positions", () => {
		const clusters = computeLayout([node("A", "p1")], []);
		const c = clusters.find((cl) => cl.key === "p1");
		expect(c).toBeTruthy();
		expect(c!.header).toBe(26);
		const laid = c!.nodes[0];
		expect(laid.x).toBeGreaterThanOrEqual(c!.x + c!.innerX - laid.w / 2);
	});
});

describe("reverseIndex + blastRadius", () => {
	it("maps importers and walks transitively per project", () => {
		const edges = [
			{ from: "A", to: "Shared" },
			{ from: "B", to: "Shared" },
			{ from: "C", to: "B" },
			{ from: "C", to: "C" },
		];
		const idx = reverseIndex(edges);
		expect(idx.Shared.sort()).toEqual(["A", "B"]);

		const blast = blastRadius("Shared", idx, () => "p");
		expect(blast.names).toEqual(["A", "B", "C"]);
		expect(blast.projectCount).toBe(1);
		expect(blast.byProject.p).toBe(3);
	});
});

describe("formatMs", () => {
	it("formats sub-millisecond, fractional, and whole values", () => {
		expect(formatMs(0.2)).toBe("<1ms");
		expect(formatMs(4.56)).toBe("4.6ms");
		expect(formatMs(120)).toBe("120ms");
	});
});
