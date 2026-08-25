import { describe, expect, it } from "vitest";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { EMPTY_ARTIFACT_JSON as EMPTY } from "./report-artifact-fixture.js";

interface ModuleNode {
	h: number;
	name: string;
	project?: string;
	w: number;
	x: number;
	y: number;
}

interface Cluster {
	h: number;
	header: number;
	innerX: number;
	innerY: number;
	key: string;
	nodes: ModuleNode[];
	w: number;
	x: number;
	y: number;
}

interface Blast {
	byProject: Record<string, number>;
	names: string[];
	projectCount: number;
}

interface LayoutApi {
	mgBlastRadius: (
		name: string,
		reverseIndex: Record<string, string[]>,
		projectOf: (n: string) => string
	) => Blast;
	mgBuildClusters: (modules: ModuleNode[]) => Cluster[];
	mgComputeLayout: (
		modules: ModuleNode[],
		edges: Array<{ from: string; to: string }>
	) => Cluster[];
	mgReverseIndex: (
		edges: Array<{ from: string; to: string }>
	) => Record<string, string[]>;
}

/** Fake dagre that ranks nodes along a diagonal, enough to exercise packing. */
const fakeDagre = {
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

/**
 * Pulls the module-graph layout functions out of the emitted script and runs
 * them. The report has no DOM harness, so this executes the real emitted
 * source rather than a copy of it.
 */
function loadLayout(dagreImpl: unknown): LayoutApi {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("function mgBuildClusters");
	const end = scripts.indexOf("function mgProvidersOf");
	if (start < 0 || end <= start) {
		throw new Error("layout functions not found in the emitted report script");
	}
	const factory = new Function(
		"dagre",
		`${scripts.slice(start, end)}
		return {
			mgBuildClusters: mgBuildClusters,
			mgComputeLayout: mgComputeLayout,
			mgReverseIndex: mgReverseIndex,
			mgBlastRadius: mgBlastRadius
		};`
	);
	return factory(dagreImpl) as LayoutApi;
}

function overlaps(
	a: { h: number; w: number; x: number; y: number },
	b: typeof a
) {
	return (
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
	);
}

function findClusterOverlap(clusters: Cluster[]): string | null {
	for (let i = 0; i < clusters.length; i++) {
		for (let j = i + 1; j < clusters.length; j++) {
			if (overlaps(clusters[i], clusters[j])) {
				return `${clusters[i].key} overlaps ${clusters[j].key}`;
			}
		}
	}
	return null;
}

function findNodeOverlap(nodes: ModuleNode[]): string | null {
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

function escapes(node: ModuleNode, cluster: Cluster): boolean {
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
	modules: ModuleNode[];
} {
	const modules: ModuleNode[] = [];
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
		const api = loadLayout(fakeDagre);
		expect(api.mgComputeLayout([], [])).toEqual([]);
		expect(api.mgReverseIndex([])).toEqual({});
	});

	it("puts every module in its project's cluster", () => {
		const api = loadLayout(fakeDagre);
		const { modules, edges } = buildMonorepo();
		const clusters = api.mgComputeLayout(modules, edges);

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
		const api = loadLayout(fakeDagre);
		const { modules, edges } = buildMonorepo();
		const clusters = api.mgComputeLayout(modules, edges);

		expect(findClusterOverlap(clusters)).toBeNull();
		expect(findNodeOverlap(modules)).toBeNull();
	});

	it("keeps every module inside its own container", () => {
		const api = loadLayout(fakeDagre);
		const { modules, edges } = buildMonorepo();
		const clusters = api.mgComputeLayout(modules, edges);

		for (const cluster of clusters) {
			for (const node of cluster.nodes) {
				expect(escapes(node, cluster)).toBe(false);
			}
		}
	});

	it("still separates everything with no dagre on the page", () => {
		const api = loadLayout(undefined);
		const { modules, edges } = buildMonorepo();
		const clusters = api.mgComputeLayout(modules, edges);

		expect(findClusterOverlap(clusters)).toBeNull();
		expect(findNodeOverlap(modules)).toBeNull();
	});

	it("gives a single-project scan one unlabelled cluster with no header", () => {
		const api = loadLayout(fakeDagre);
		const modules: ModuleNode[] = [
			{ name: "AppModule", x: 0, y: 0, w: 140, h: 40 },
			{ name: "UsersModule", x: 0, y: 0, w: 140, h: 40 },
		];
		const clusters = api.mgComputeLayout(modules, [
			{ from: "AppModule", to: "UsersModule" },
		]);

		expect(clusters).toHaveLength(1);
		expect(clusters[0].key).toBe("");
		expect(clusters[0].header).toBe(0);
		expect(findNodeOverlap(modules)).toBeNull();
	});
});

describe("module graph blast radius", () => {
	it("collapses duplicate import edges", () => {
		const api = loadLayout(fakeDagre);
		const index = api.mgReverseIndex([
			{ from: "a", to: "c" },
			{ from: "a", to: "c" },
			{ from: "b", to: "c" },
		]);
		expect(index.c).toEqual(["a", "b"]);
	});

	it("counts transitive dependents per project", () => {
		const api = loadLayout(fakeDagre);
		const { modules, edges } = buildMonorepo();
		const projectOf = (name: string) =>
			modules.find((m) => m.name === name)?.project ?? "";
		const blast = api.mgBlastRadius(
			"shared/CoreModule",
			api.mgReverseIndex(edges),
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
		const api = loadLayout(fakeDagre);
		const { edges } = buildMonorepo();
		const blast = api.mgBlastRadius(
			"tools/ScriptsModule",
			api.mgReverseIndex(edges),
			() => "tools"
		);

		expect(blast.names).toEqual([]);
		expect(blast.projectCount).toBe(0);
	});

	it("terminates on a cycle instead of looping", () => {
		const api = loadLayout(fakeDagre);
		const blast = api.mgBlastRadius(
			"A",
			api.mgReverseIndex([
				{ from: "A", to: "B" },
				{ from: "B", to: "A" },
			]),
			() => ""
		);

		expect(blast.names).toEqual(["B"]);
	});
});
