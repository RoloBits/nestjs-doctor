import { describe, expect, it } from "vitest";
import {
	blastRadius,
	computeLayout,
	type DagreLike,
	type LayoutNode,
	reverseIndex,
} from "../module-layout";

/** Fake dagre that ranks nodes along a diagonal, enough to exercise packing. */
const fakeDagre: DagreLike = {
	graphlib: {
		Graph: class {
			private readonly nodes = new Map<
				string,
				{ height: number; width: number; x: number; y: number }
			>();
			private order = 0;
			setGraph() {
				return this;
			}
			setDefaultEdgeLabel() {
				return this;
			}
			setNode(id: string, value: { height: number; width: number }) {
				this.order += 1;
				this.nodes.set(id, {
					...value,
					x: this.order * 300,
					y: this.order * 120,
				});
			}
			setEdge() {
				return this;
			}
			node(id: string) {
				return this.nodes.get(id);
			}
		},
	},
	layout() {
		// Positions are assigned in setNode.
	},
};

function overlaps(
	a: { h: number; w: number; x: number; y: number },
	b: typeof a
): boolean {
	return (
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
	);
}

function findClusterOverlap(clusters: ReturnType<typeof computeLayout>) {
	for (let i = 0; i < clusters.length; i++) {
		for (let j = i + 1; j < clusters.length; j++) {
			if (overlaps(clusters[i], clusters[j])) {
				return `${clusters[i].key} overlaps ${clusters[j].key}`;
			}
		}
	}
	return null;
}

function findNodeOverlap(nodes: LayoutNode[]): string | null {
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i];
			const b = nodes[j];
			if (
				Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
				Math.abs(a.y - b.y) < (a.h + b.h) / 2
			) {
				return `${a.name} overlaps ${b.name}`;
			}
		}
	}
	return null;
}

function escapes(
	node: LayoutNode,
	cluster: { header: number; h: number; w: number; x: number; y: number }
): boolean {
	return (
		node.x - node.w / 2 < cluster.x ||
		node.x + node.w / 2 > cluster.x + cluster.w ||
		node.y - node.h / 2 < cluster.y + cluster.header ||
		node.y + node.h / 2 > cluster.y + cluster.h
	);
}

/** Three projects: a shared lib, two apps importing it, plus a loose module. */
function buildMonorepo(): {
	edges: Array<{ from: string; to: string }>;
	modules: LayoutNode[];
} {
	const modules: LayoutNode[] = [];
	const edges: Array<{ from: string; to: string }> = [];
	const add = (name: string, project: string) => {
		modules.push({ name, project, x: 0, y: 0, w: 140, h: 40 });
	};

	add("shared/CoreModule", "shared");
	add("shared/LoggerModule", "shared");
	edges.push({ from: "shared/CoreModule", to: "shared/LoggerModule" });

	for (const app of ["api", "worker"]) {
		add(`${app}/AppModule`, app);
		add(`${app}/UsersModule`, app);
		edges.push({ from: `${app}/AppModule`, to: `${app}/UsersModule` });
		edges.push({ from: `${app}/UsersModule`, to: "shared/CoreModule" });
	}

	add("tools/ScriptsModule", "tools");
	return { modules, edges };
}

describe("module graph clustered layout", () => {
	it("survives a project with no modules", () => {
		expect(computeLayout([], [], fakeDagre)).toEqual([]);
		expect(reverseIndex([])).toEqual({});
	});

	it("puts every module in its project's cluster", () => {
		const { modules, edges } = buildMonorepo();
		const clusters = computeLayout(modules, edges, fakeDagre);

		expect(clusters.map((c) => c.key).sort()).toEqual([
			"api",
			"shared",
			"tools",
			"worker",
		]);
		for (const cluster of clusters) {
			for (const node of cluster.nodes) {
				expect(node.project).toBe(cluster.key);
			}
		}
	});

	it("keeps clusters and modules from overlapping", () => {
		const { modules, edges } = buildMonorepo();
		const clusters = computeLayout(modules, edges, fakeDagre);

		expect(findClusterOverlap(clusters)).toBeNull();
		expect(findNodeOverlap(modules)).toBeNull();
	});

	it("keeps every module inside its own container", () => {
		const { modules, edges } = buildMonorepo();
		const clusters = computeLayout(modules, edges, fakeDagre);

		for (const cluster of clusters) {
			for (const node of cluster.nodes) {
				expect(escapes(node, cluster)).toBe(false);
			}
		}
	});

	it("still separates everything with no dagre on the page", () => {
		const { modules, edges } = buildMonorepo();
		const clusters = computeLayout(modules, edges, undefined);

		expect(findClusterOverlap(clusters)).toBeNull();
		expect(findNodeOverlap(modules)).toBeNull();
	});

	it("gives a single-project scan one unlabelled cluster with no header", () => {
		const modules: LayoutNode[] = [
			{ name: "AppModule", x: 0, y: 0, w: 140, h: 40 },
			{ name: "UsersModule", x: 0, y: 0, w: 140, h: 40 },
		];
		const clusters = computeLayout(
			modules,
			[{ from: "AppModule", to: "UsersModule" }],
			fakeDagre
		);

		expect(clusters).toHaveLength(1);
		expect(clusters[0].key).toBe("");
		expect(clusters[0].header).toBe(0);
		expect(findNodeOverlap(modules)).toBeNull();
	});
});

describe("module graph blast radius", () => {
	it("collapses duplicate import edges", () => {
		const index = reverseIndex([
			{ from: "a", to: "c" },
			{ from: "a", to: "c" },
			{ from: "b", to: "c" },
		]);
		expect(index.c).toEqual(["a", "b"]);
	});

	it("counts transitive dependents per project", () => {
		const { modules, edges } = buildMonorepo();
		const projectOf = (name: string) =>
			modules.find((m) => m.name === name)?.project ?? "";
		const blast = blastRadius(
			"shared/CoreModule",
			reverseIndex(edges),
			projectOf
		);

		expect(blast.names).toEqual([
			"api/AppModule",
			"api/UsersModule",
			"worker/AppModule",
			"worker/UsersModule",
		]);
		expect(blast.projectCount).toBe(2);
		expect(blast.byProject).toEqual({ api: 2, worker: 2 });
	});

	it("reports an empty radius for a module nothing imports", () => {
		const { edges } = buildMonorepo();
		const blast = blastRadius(
			"tools/ScriptsModule",
			reverseIndex(edges),
			() => "tools"
		);

		expect(blast.names).toEqual([]);
		expect(blast.projectCount).toBe(0);
	});

	it("terminates on a cycle instead of looping", () => {
		const blast = blastRadius(
			"A",
			reverseIndex([
				{ from: "A", to: "B" },
				{ from: "B", to: "A" },
			]),
			() => ""
		);

		expect(blast.names).toEqual(["B"]);
	});
});
