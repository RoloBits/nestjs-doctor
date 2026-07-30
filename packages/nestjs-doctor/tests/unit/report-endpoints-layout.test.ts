import { describe, expect, it } from "vitest";
import {
	getReportScripts,
	type ReportScriptData,
} from "../../src/report/ui/scripts.js";

const EMPTY: ReportScriptData = {
	diagnosticsJson: "[]",
	elapsedMsJson: "0",
	endpointDiagnosticsJson: '{"perEndpoint":{},"perFile":{}}',
	endpointsJson: '{"endpoints":[]}',
	examplesJson: "[]",
	fileSourcesJson: "{}",
	graphJson: '{"modules":[],"edges":[]}',
	projectJson: "{}",
	providersJson: "[]",
	schemaJson: "null",
	sourceLinesJson: "{}",
	summaryJson: "{}",
};

const EP_BOX_W = 320;

interface Box {
	controllerClass: string;
	endpointIndices: number[];
	h: number;
	w: number;
	x: number;
	y: number;
}

interface Group {
	boxes: Box[];
	h: number;
	headerY: number;
	label: string;
	w: number;
}

/**
 * Pulls the pure box-sizing helpers out of the emitted script by name, the same
 * way report-schema-layout.test.ts extracts sNodeHeight/sVisibleColCount.
 */
function getSizingHelpers(): {
	epBoxHeight: (count: number) => number;
	epRowCount: (count: number) => number;
	EP_BOX_HEADER_H: number;
	EP_BOX_PAD_BOTTOM: number;
	EP_MAX_VISIBLE_ROWS: number;
	EP_ROW_H: number;
} {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("var EP_BOX_W");
	const end = scripts.indexOf("function epCacheOverviewLabels");
	if (start < 0 || end <= start) {
		throw new Error(
			"box sizing helpers not found in the emitted report script"
		);
	}
	const factory = new Function(
		`${scripts.slice(start, end)}\nreturn { epRowCount: epRowCount, epBoxHeight: epBoxHeight, EP_BOX_HEADER_H: EP_BOX_HEADER_H, EP_ROW_H: EP_ROW_H, EP_BOX_PAD_BOTTOM: EP_BOX_PAD_BOTTOM, EP_MAX_VISIBLE_ROWS: EP_MAX_VISIBLE_ROWS };`
	);
	return factory();
}

/**
 * Pulls the pure layout function out of the emitted script and runs it against
 * synthetic module/controller groups, the same extraction technique
 * report-schema-layout.test.ts uses for sComputeOverviewLayout.
 */
function runOverviewLayout(groups: Group[], boxWidth: number): void {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("// ep-overview-layout-start");
	const end = scripts.indexOf("// ep-overview-layout-end");
	if (start < 0 || end <= start) {
		throw new Error("layout functions not found in the emitted report script");
	}

	const factory = new Function(
		"groups",
		"boxWidth",
		`${scripts.slice(start, end)}\nepComputeOverviewLayout(groups, boxWidth);`
	);
	factory(groups, boxWidth);
}

interface TreeNode {
	childCount?: number;
	expanded: boolean;
	id: number;
	visible?: boolean;
}

interface TreeEdge {
	from: number;
	to: number;
}

/**
 * Pulls the pure visibility function out of the emitted script and runs it
 * against synthetic nodes/edges, the same extraction technique
 * runOverviewLayout uses for epComputeOverviewLayout.
 */
function runTreeVisibility(nodes: TreeNode[], edges: TreeEdge[]): void {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("// ep-tree-visibility-start");
	const end = scripts.indexOf("// ep-tree-visibility-end");
	if (start < 0 || end <= start) {
		throw new Error(
			"tree visibility function not found in the emitted report script"
		);
	}

	const factory = new Function(
		"nodes",
		"edges",
		`${scripts.slice(start, end)}\nepComputeTreeVisibility(nodes, edges);`
	);
	factory(nodes, edges);
}

interface DepParam {
	name: string;
	type: string | null;
}

interface DepGuardThrow {
	branchKind: string | null;
	callSiteLine: number;
	className: string;
	conditionText: string | null;
	message: string | null;
}

interface DepFixture {
	assignedTo: string | null;
	branchKind: string | null;
	className: string;
	conditional: boolean;
	conditionText: string | null;
	dependencies: DepFixture[];
	endLine: number;
	filePath: string;
	guardThrow: DepGuardThrow | null;
	iterationKind: string | null;
	iterationLabel: string | null;
	line: number;
	methodName: string;
	parameters: DepParam[];
	throwMessage: string | null;
	totalMethods: number;
	type: string;
}

interface EndpointFixture {
	controllerClass: string;
	dependencies: DepFixture[];
	endLine: number;
	filePath: string;
	handlerMethod: string;
	line: number;
}

interface BuildGraphNode {
	assignedTo?: string | null;
	className: string;
	displayOrder?: number;
	expanded: boolean;
	id: number;
	kind?: string;
	methodName: string | null;
}

interface BuildGraphEdge {
	conditional: boolean;
	from: number;
	to: number;
}

/**
 * Pulls epBuildGraph (and everything it calls — epClipText, epBuildNodeExtras,
 * epBuildBreakNodeExtras, epComputeTreeVisibility) out of the emitted script and
 * runs it against a synthetic endpoint. epNodes/epEdges are declared locally in the
 * wrapper so epBuildGraph's plain assignments land there instead of leaking globals;
 * epCtx is stubbed with a measureText so label truncation runs for real.
 */
function runBuildGraph(ep: EndpointFixture): {
	edges: BuildGraphEdge[];
	nodes: BuildGraphNode[];
} {
	const scripts = getReportScripts(EMPTY);
	const start = scripts.indexOf("// ep-build-graph-start");
	const end = scripts.indexOf("// ep-build-graph-end");
	if (start < 0 || end <= start) {
		throw new Error(
			"graph-build functions not found in the emitted report script"
		);
	}

	const factory = new Function(
		"ep",
		"epCtx",
		`var epNodes, epEdges;\n${scripts.slice(start, end)}\nepBuildGraph(ep);\nreturn { nodes: epNodes, edges: epEdges };`
	);
	const stubCtx = {
		font: "",
		measureText: (text: string) => ({ width: text.length }),
	};
	return factory(ep, stubCtx);
}

/**
 * AccessController.deleteAccess() shape: access() (guarded, assigns originalAccess,
 * itself calling a repository), then deleteAccess(). Mirrors the real Ghostfolio
 * DELETE /access/:id handler this feature was built against.
 */
function buildGuardThrowFixture(): EndpointFixture {
	return {
		controllerClass: "AccessController",
		dependencies: [
			{
				assignedTo: "originalAccess",
				branchKind: null,
				className: "AccessService",
				conditional: false,
				conditionText: null,
				dependencies: [
					{
						assignedTo: null,
						branchKind: null,
						className: "PrismaService",
						conditional: false,
						conditionText: null,
						dependencies: [],
						endLine: 3,
						filePath: "prisma.service.ts",
						guardThrow: null,
						iterationKind: null,
						iterationLabel: null,
						line: 3,
						methodName: "findUnique",
						parameters: [],
						throwMessage: null,
						totalMethods: 1,
						type: "repository",
					},
				],
				endLine: 5,
				filePath: "access.service.ts",
				guardThrow: {
					branchKind: "if",
					callSiteLine: 12,
					className: "HttpException",
					conditionText: "!originalAccess",
					message: "Forbidden",
				},
				iterationKind: null,
				iterationLabel: null,
				line: 5,
				methodName: "access",
				parameters: [{ name: "where", type: "AccessWhereInput" }],
				throwMessage: null,
				totalMethods: 1,
				type: "service",
			},
			{
				assignedTo: null,
				branchKind: null,
				className: "AccessService",
				conditional: false,
				conditionText: null,
				dependencies: [],
				endLine: 8,
				filePath: "access.service.ts",
				guardThrow: null,
				iterationKind: null,
				iterationLabel: null,
				line: 8,
				methodName: "deleteAccess",
				parameters: [{ name: "id", type: "string" }],
				throwMessage: null,
				totalMethods: 1,
				type: "service",
			},
		],
		endLine: 20,
		filePath: "access.controller.ts",
		handlerMethod: "deleteAccess",
		line: 10,
	};
}

/**
 * root(0) -> A(1), B(2); A(1) -> A1(3), A2(4); B(2) -> B1(5); A1(3) -> A1a(6).
 * Root starts expanded (depth-1 default-visible), everything else collapsed.
 */
function buildTreeFixture(): { edges: TreeEdge[]; nodes: TreeNode[] } {
	const nodes: TreeNode[] = [
		{ id: 0, expanded: true },
		{ id: 1, expanded: false },
		{ id: 2, expanded: false },
		{ id: 3, expanded: false },
		{ id: 4, expanded: false },
		{ id: 5, expanded: false },
		{ id: 6, expanded: false },
	];
	const edges: TreeEdge[] = [
		{ from: 0, to: 1 },
		{ from: 0, to: 2 },
		{ from: 1, to: 3 },
		{ from: 1, to: 4 },
		{ from: 2, to: 5 },
		{ from: 3, to: 6 },
	];
	return { nodes, edges };
}

function visibleIds(nodes: TreeNode[]): number[] {
	return nodes
		.filter((n) => n.visible)
		.map((n) => n.id)
		.sort((a, b) => a - b);
}

function findNode(nodes: TreeNode[], id: number): TreeNode {
	const found = nodes.find((n) => n.id === id);
	if (!found) {
		throw new Error(`fixture missing node ${id}`);
	}
	return found;
}

function overlaps(a: Box, b: Box): boolean {
	return (
		Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
		Math.abs(a.y - b.y) < (a.h + b.h) / 2
	);
}

function findOverlap(boxes: Box[]): string | null {
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			if (overlaps(boxes[i], boxes[j])) {
				return `${boxes[i].controllerClass} overlaps ${boxes[j].controllerClass}`;
			}
		}
	}
	return null;
}

/** 30 endpoints across 8 controllers in 3 modules; one controller exceeds the 12-row cap. */
function buildFixture(epBoxHeight: (count: number) => number): {
	groups: Group[];
	totalEndpoints: number;
} {
	const controllerCounts: Array<{
		controller: string;
		count: number;
		module: string;
	}> = [
		{ controller: "UsersController", count: 15, module: "UsersModule" },
		{ controller: "ProfilesController", count: 3, module: "UsersModule" },
		{ controller: "SessionsController", count: 2, module: "UsersModule" },
		{ controller: "OrdersController", count: 4, module: "OrdersModule" },
		{ controller: "InvoicesController", count: 2, module: "OrdersModule" },
		{ controller: "HealthController", count: 1, module: "AdminModule" },
		{ controller: "MetricsController", count: 2, module: "AdminModule" },
		{ controller: "AuditController", count: 1, module: "AdminModule" },
	];

	let index = 0;
	const byModule = new Map<string, Box[]>();
	const moduleOrder: string[] = [];
	let totalEndpoints = 0;

	for (const entry of controllerCounts) {
		const endpointIndices: number[] = [];
		for (let i = 0; i < entry.count; i++) {
			endpointIndices.push(index++);
		}
		totalEndpoints += entry.count;

		if (!byModule.has(entry.module)) {
			byModule.set(entry.module, []);
			moduleOrder.push(entry.module);
		}
		byModule.get(entry.module)?.push({
			controllerClass: entry.controller,
			endpointIndices,
			h: epBoxHeight(entry.count),
			w: EP_BOX_W,
			x: 0,
			y: 0,
		});
	}

	const groups: Group[] = moduleOrder.map((label) => ({
		boxes: byModule.get(label) ?? [],
		h: 0,
		headerY: 0,
		label,
		w: 0,
	}));

	return { groups, totalEndpoints };
}

/** 40 modules, each with one controller and 1-2 endpoints — Twenty-shaped: lots of tiny modules. */
function buildManySmallModulesFixture(
	epBoxHeight: (count: number) => number
): Group[] {
	const groups: Group[] = [];
	for (let m = 0; m < 40; m++) {
		const count = m % 2 === 0 ? 1 : 2;
		groups.push({
			boxes: [
				{
					controllerClass: `Controller${m}`,
					endpointIndices: Array.from({ length: count }, (_, i) => i),
					h: epBoxHeight(count),
					w: EP_BOX_W,
					x: 0,
					y: 0,
				},
			],
			h: 0,
			headerY: 0,
			label: `Module${m}`,
			w: 0,
		});
	}
	return groups;
}

describe("endpoints overview box sizing", () => {
	it("caps visible rows at 12 and adds one +N more row only once past the cap", () => {
		const {
			epRowCount,
			epBoxHeight,
			EP_BOX_HEADER_H,
			EP_ROW_H,
			EP_BOX_PAD_BOTTOM,
			EP_MAX_VISIBLE_ROWS,
		} = getSizingHelpers();

		expect(EP_MAX_VISIBLE_ROWS).toBe(12);
		expect(epRowCount(30)).toBe(12);
		expect(epRowCount(5)).toBe(5);

		// Exactly at the cap: no hidden endpoints, no "+N more" row.
		const atCap = epBoxHeight(12);
		expect(atCap).toBe(EP_BOX_HEADER_H + 12 * EP_ROW_H + EP_BOX_PAD_BOTTOM);

		// One past the cap: a single extra row for "+1 more".
		const onePast = epBoxHeight(13);
		expect(onePast).toBe(atCap + EP_ROW_H);

		// Any further growth adds no more height — still just one "+N more" row.
		const wayPast = epBoxHeight(30);
		expect(wayPast).toBe(onePast);
	});
});

describe("endpoints overview layout", () => {
	it("packs boxes without overlap within or across module clusters", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		runOverviewLayout(groups, EP_BOX_W);

		const allBoxes = groups.flatMap((g) => g.boxes);
		expect(allBoxes).toHaveLength(8);
		expect(findOverlap(allBoxes)).toBeNull();
	});

	it("keeps every module's boxes in a Y-band that does not overlap another module's", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		runOverviewLayout(groups, EP_BOX_W);

		const bands = groups.map((g) => {
			const tops = g.boxes.map((b) => b.y - b.h / 2);
			const bottoms = g.boxes.map((b) => b.y + b.h / 2);
			return { min: Math.min(...tops), max: Math.max(...bottoms) };
		});

		for (let i = 0; i < bands.length; i++) {
			for (let j = i + 1; j < bands.length; j++) {
				const disjoint =
					bands[i].max <= bands[j].min || bands[j].max <= bands[i].min;
				expect(disjoint).toBe(true);
			}
		}
	});

	it("preserves which module each controller box belongs to", () => {
		const { epBoxHeight } = getSizingHelpers();
		const { groups } = buildFixture(epBoxHeight);
		const before = groups.map((g) => ({
			label: g.label,
			controllers: g.boxes.map((b) => b.controllerClass),
		}));

		runOverviewLayout(groups, EP_BOX_W);

		const after = groups.map((g) => ({
			label: g.label,
			controllers: g.boxes.map((b) => b.controllerClass),
		}));
		expect(after).toEqual(before);
	});

	it("produces an identical layout across repeated runs", () => {
		const { epBoxHeight } = getSizingHelpers();
		const first = buildFixture(epBoxHeight).groups;
		const second = buildFixture(epBoxHeight).groups;

		runOverviewLayout(first, EP_BOX_W);
		runOverviewLayout(second, EP_BOX_W);

		const strip = (groups: Group[]) =>
			groups.map((g) => ({
				headerY: g.headerY,
				w: g.w,
				h: g.h,
				boxes: g.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
			}));

		expect(strip(first)).toEqual(strip(second));
	});
});

describe("endpoints overview layout — many small modules (real-project shape)", () => {
	it("packs one-controller modules onto shared rows instead of one per row", () => {
		const { epBoxHeight } = getSizingHelpers();
		const groups = buildManySmallModulesFixture(epBoxHeight);
		runOverviewLayout(groups, EP_BOX_W);

		const allBoxes = groups.flatMap((g) => g.boxes);
		expect(findOverlap(allBoxes)).toBeNull();

		// (b) more than one group per row: some pair of groups' headerY..headerY+h
		// ranges overlap, instead of every group getting its own vertical band.
		const bands = groups.map((g) => ({ min: g.headerY, max: g.headerY + g.h }));
		let sharedRow = false;
		for (let i = 0; i < bands.length && !sharedRow; i++) {
			for (let j = i + 1; j < bands.length; j++) {
				if (bands[i].max > bands[j].min && bands[j].max > bands[i].min) {
					sharedRow = true;
					break;
				}
			}
		}
		expect(sharedRow).toBe(true);

		// (c) bounded aspect ratio: a skyscraper of 40 one-per-row modules would be
		// far taller than wide; packed onto rows it stays close to square-ish.
		const minX = Math.min(...allBoxes.map((b) => b.x - b.w / 2));
		const maxX = Math.max(...allBoxes.map((b) => b.x + b.w / 2));
		const minY = Math.min(...groups.map((g) => g.headerY));
		const maxY = Math.max(...allBoxes.map((b) => b.y + b.h / 2));
		const width = maxX - minX;
		const height = maxY - minY;
		expect(height).toBeLessThanOrEqual(width * 3);
	});

	it("produces an identical layout across repeated runs", () => {
		const { epBoxHeight } = getSizingHelpers();
		const first = buildManySmallModulesFixture(epBoxHeight);
		const second = buildManySmallModulesFixture(epBoxHeight);

		runOverviewLayout(first, EP_BOX_W);
		runOverviewLayout(second, EP_BOX_W);

		const strip = (groups: Group[]) =>
			groups.map((g) => ({
				headerY: g.headerY,
				w: g.w,
				h: g.h,
				boxes: g.boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
			}));

		expect(strip(first)).toEqual(strip(second));
	});
});

describe("endpoints focused-tree visibility", () => {
	it("defaults to the root plus its direct children", () => {
		const { nodes, edges } = buildTreeFixture();
		runTreeVisibility(nodes, edges);

		expect(visibleIds(nodes)).toEqual([0, 1, 2]);
		expect(findNode(nodes, 0).childCount).toBe(2);
		expect(findNode(nodes, 1).childCount).toBe(2);
		expect(findNode(nodes, 2).childCount).toBe(1);
		expect(findNode(nodes, 6).childCount).toBe(0);
	});

	it("expanding a node reveals exactly its own children, not grandchildren", () => {
		const { nodes, edges } = buildTreeFixture();
		runTreeVisibility(nodes, edges);

		findNode(nodes, 1).expanded = true; // expand A
		runTreeVisibility(nodes, edges);

		expect(visibleIds(nodes)).toEqual([0, 1, 2, 3, 4]);
	});

	it("collapsing an ancestor hides descendants while their own expanded flags persist", () => {
		const { nodes, edges } = buildTreeFixture();

		findNode(nodes, 1).expanded = true; // A
		findNode(nodes, 3).expanded = true; // A1
		runTreeVisibility(nodes, edges);
		expect(visibleIds(nodes)).toEqual([0, 1, 2, 3, 4, 6]);

		findNode(nodes, 1).expanded = false; // collapse A
		runTreeVisibility(nodes, edges);
		expect(visibleIds(nodes)).toEqual([0, 1, 2]);
		expect(findNode(nodes, 3).expanded).toBe(true); // A1's own flag untouched

		findNode(nodes, 1).expanded = true; // re-expand A
		runTreeVisibility(nodes, edges);
		// A1a (6) reappears without re-toggling A1 (3) — its flag never changed.
		expect(visibleIds(nodes)).toEqual([0, 1, 2, 3, 4, 6]);
	});

	it("is deterministic across repeated runs", () => {
		const first = buildTreeFixture();
		const second = buildTreeFixture();
		first.nodes[1].expanded = true;
		second.nodes[1].expanded = true;

		runTreeVisibility(first.nodes, first.edges);
		runTreeVisibility(second.nodes, second.edges);

		const strip = (nodes: TreeNode[]) =>
			nodes.map((n) => ({
				id: n.id,
				visible: n.visible,
				childCount: n.childCount,
			}));

		expect(strip(first.nodes)).toEqual(strip(second.nodes));
	});
});

describe("endpoints focused-tree display numbering", () => {
	it("numbers the Ghostfolio flagship case #1 access / #2 break / #3 deleteAccess", () => {
		const { nodes, edges } = runBuildGraph(buildGuardThrowFixture());

		// Root is always id 0 — the first node epBuildGraph creates.
		const rootLevelIds = edges.filter((e) => e.from === 0).map((e) => e.to);
		const rootLevel = rootLevelIds.map(
			(id) => nodes.find((n) => n.id === id) as BuildGraphNode
		);

		expect(rootLevel.map((n) => n.methodName ?? n.kind)).toEqual([
			"access",
			"break",
			"deleteAccess",
		]);
		expect(rootLevel.map((n) => n.displayOrder)).toEqual([0, 1, 2]);
	});

	it("inserts the break node under the guarded call's own parent, not its subtree", () => {
		const { nodes, edges } = runBuildGraph(buildGuardThrowFixture());

		const accessNode = nodes.find((n) => n.methodName === "access");
		const breakNode = nodes.find((n) => n.kind === "break");
		const accessEdge = edges.find((e) => e.to === accessNode?.id);
		const breakEdge = edges.find((e) => e.to === breakNode?.id);

		// Same parent as the guarded call (the root/caller), not the call itself.
		expect(breakEdge?.from).toBe(accessEdge?.from);

		// access()'s own child (findUnique) hangs off access(), not off the break node.
		const childEdge = edges.find((e) => e.from === accessNode?.id);
		expect(childEdge).toBeDefined();
		expect(childEdge?.from).not.toBe(breakNode?.id);
	});

	it("restarts numbering per sibling level instead of sorting the whole tree", () => {
		const { nodes, edges } = runBuildGraph(buildGuardThrowFixture());

		const accessNode = nodes.find((n) => n.methodName === "access");
		const findUniqueEdge = edges.find((e) => e.from === accessNode?.id);
		const findUniqueNode = nodes.find((n) => n.id === findUniqueEdge?.to);

		// access()'s only child is the first (and only) call at its own level, #1
		// again — same number as access() itself at the root level, by design.
		expect(findUniqueNode?.displayOrder).toBe(0);
	});

	it("keeps display numbers stable across a simulated collapse/expand", () => {
		const { nodes, edges } = runBuildGraph(buildGuardThrowFixture());
		const before = nodes.map((n) => ({
			id: n.id,
			displayOrder: n.displayOrder,
		}));

		const root = nodes.find((n) => n.id === 0) as unknown as TreeNode;
		root.expanded = false;
		runTreeVisibility(nodes as unknown as TreeNode[], edges);
		root.expanded = true;
		runTreeVisibility(nodes as unknown as TreeNode[], edges);

		const after = nodes.map((n) => ({
			id: n.id,
			displayOrder: n.displayOrder,
		}));
		expect(after).toEqual(before);
	});
});
