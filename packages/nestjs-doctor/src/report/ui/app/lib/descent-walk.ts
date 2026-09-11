import type {
	CallEdge,
	CodeGraph,
	EntryPoint,
	MethodNode,
	NodeId,
} from "../../../../common/code-graph.js";

/** What a callee does, used to colour its card and its incoming wires. */
export type Effect = "write" | "read" | "throw" | "external" | "plain";

/** The direction of an ORM call, read off the method name on a `db` node. */
export type DbOp = "read" | "write" | "other";

/** The partition the filter chips switch on. Every step is exactly one. */
export type StepCategory =
	| "error"
	| "warn"
	| "log"
	| "throw"
	| "write"
	| "read"
	| "external"
	| "call";

export interface DescentNode {
	className: string;
	/** Set only on a `db` node. */
	dbOp: DbOp | null;
	/** Shortest call depth from the entry. */
	depth: number;
	effect: Effect;
	/** Last line of the method body, for the source pane's highlight. */
	endLine: number;
	filePath: string;
	id: NodeId;
	kind: string;
	label: string;
	/** First line of the method declaration. */
	line: number;
	/** Property the call went through: `user` in `this.prisma.user.find()`. */
	member: string | null;
	methodName: string;
	/** `throw` statements in the method body. */
	throws: number;
}

interface DescentEdgeInfo {
	awaited: boolean;
	concurrent: boolean;
	conditional: boolean;
	from: number;
	guard: boolean;
	inTry: boolean;
	iteration: "loop" | "callback" | "concurrent" | null;
	line: number;
	order: number;
	to: number;
}

export interface DescentStep {
	depth: number;
	/** Index into `edges`, or -1 on the entry step. */
	edge: number;
	node: number;
	/** The step that called this one, or -1 on the entry step. */
	parent: number;
	/** The callee is already on the current path; emitted, not descended into. */
	recursive: boolean;
	/** The node ran earlier in the walk, at some other moment. */
	revisit: boolean;
}

interface DescentVerdict {
	/** Step index of the first db read, or -1. */
	firstRead: number;
	/** Step index of the first db write, or -1. */
	firstWrite: number;
	other: number;
	reads: number;
	text: string;
	writes: number;
}

export interface DescentEndpoint {
	controllerClass: string;
	/** Depth of each tier, in the order `tiers` holds them. */
	depths: number[];
	edges: DescentEdgeInfo[];
	handlerMethod: string;
	httpMethod: string;
	key: string;
	nodes: DescentNode[];
	routePath: string;
	/** Node index to the walk steps it is. */
	stepsOf: number[][];
	/** Node indices per depth tier, ordered by the step that first reaches them. */
	tiers: number[][];
	/** The walk hit the step ceiling and stops short of the whole descent. */
	truncated: boolean;
	verdict: DescentVerdict;
	walk: DescentStep[];
}

/** Step ceiling for one walk; past it the walk stops and reports truncated. */
const MAX_STEPS = 5000;

const READ_PREFIXES = ["find", "get", "count", "aggregate"];
const WRITE_PREFIXES = ["create", "update", "upsert", "delete"];
const LOG_METHODS = ["log", "debug", "verbose", "info", "trace"];
const LOGGER_CLASS = /Logger$/;

/** Read, write or other, from the prefix of an ORM method name. */
export function dbOperation(methodName: string): DbOp {
	const name = methodName.toLowerCase();
	if (WRITE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
		return "write";
	}
	if (READ_PREFIXES.some((prefix) => name.startsWith(prefix))) {
		return "read";
	}
	return "other";
}

function countThrows(node: MethodNode): number {
	return node.body.filter((item) => item.kind === "throw").length;
}

/** A node's effect: its db direction, else throw, else external, else plain. */
function nodeEffect(
	node: MethodNode,
	dbOp: DbOp | null,
	throws: number
): Effect {
	if (dbOp === "read" || dbOp === "write") {
		return dbOp;
	}
	if (throws > 0) {
		return "throw";
	}
	if (node.kind === "unresolved") {
		return "external";
	}
	return "plain";
}

export function stepCategory(node: DescentNode): StepCategory {
	if (LOGGER_CLASS.test(node.className)) {
		const name = node.methodName.toLowerCase();
		if (LOG_METHODS.includes(name)) {
			return "log";
		}
		if (name === "warn") {
			return "warn";
		}
		if (name === "error" || name === "fatal") {
			return "error";
		}
	}
	return node.effect === "plain" ? "call" : node.effect;
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list) {
		list.push(value);
	} else {
		map.set(key, [value]);
	}
}

function nodeLabel(node: MethodNode): string {
	const method = node.member
		? `${node.member}.${node.methodName}`
		: node.methodName;
	return node.className ? `${node.className}#${method}` : method;
}

/** Shortest call depth from the entry, over the raw call sites. */
function depthsFrom(
	entry: number,
	outgoing: Map<number, DescentEdgeInfo[]>,
	size: number
): number[] {
	const depth = new Array<number>(size).fill(Number.POSITIVE_INFINITY);
	depth[entry] = 0;
	// The array iterator re-reads length, so entries pushed while looping run too.
	const queue = [entry];
	for (const from of queue) {
		for (const edge of outgoing.get(from) ?? []) {
			if (depth[edge.to] === Number.POSITIVE_INFINITY) {
				depth[edge.to] = (depth[from] as number) + 1;
				queue.push(edge.to);
			}
		}
	}
	return depth.map((d) => (d === Number.POSITIVE_INFINITY ? 0 : d));
}

interface WalkResult {
	truncated: boolean;
	walk: DescentStep[];
}

/**
 * Depth-first from the entry, each node's outgoing edges in `order`. A callee
 * already on the current path is emitted as a step and not descended into.
 */
function walkFrom(
	entry: number,
	outgoing: Map<number, DescentEdgeInfo[]>,
	edgeIndex: Map<DescentEdgeInfo, number>
): WalkResult {
	const walk: DescentStep[] = [];
	const onPath = new Set<number>();
	const seen = new Set<number>();
	let truncated = false;

	const descend = (
		node: number,
		depth: number,
		edge: number,
		parent: number,
		recursive: boolean
	): void => {
		if (walk.length >= MAX_STEPS) {
			truncated = true;
			return;
		}
		const here = walk.length;
		walk.push({
			depth,
			edge,
			node,
			parent,
			recursive,
			revisit: seen.has(node),
		});
		seen.add(node);
		if (recursive) {
			return;
		}
		onPath.add(node);
		for (const next of outgoing.get(node) ?? []) {
			descend(
				next.to,
				depth + 1,
				edgeIndex.get(next) ?? -1,
				here,
				onPath.has(next.to)
			);
		}
		onPath.delete(node);
	};

	descend(entry, 0, -1, -1, false);
	return { truncated, walk };
}

function verdictOf(nodes: DescentNode[], walk: DescentStep[]): DescentVerdict {
	let firstRead = -1;
	let firstWrite = -1;
	let reads = 0;
	let writes = 0;
	let other = 0;
	for (const [index, step] of walk.entries()) {
		const op = nodes[step.node]?.dbOp;
		if (!op) {
			continue;
		}
		if (op === "read") {
			reads++;
			firstRead = firstRead === -1 ? index : firstRead;
		} else if (op === "write") {
			writes++;
			firstWrite = firstWrite === -1 ? index : firstWrite;
		} else {
			other++;
		}
	}
	return {
		firstRead,
		firstWrite,
		other,
		reads,
		text: verdictText(firstRead, firstWrite, reads + writes + other),
		writes,
	};
}

function verdictText(
	firstRead: number,
	firstWrite: number,
	total: number
): string {
	if (total === 0) {
		return "no db node on this path";
	}
	if (firstRead === -1 && firstWrite === -1) {
		return "db calls, direction unclassified";
	}
	if (firstWrite === -1) {
		return `read @${firstRead}, no write`;
	}
	if (firstRead === -1) {
		return `write @${firstWrite}, no read`;
	}
	return firstRead < firstWrite
		? `read before write · @${firstRead} then @${firstWrite}`
		: `write before read · @${firstWrite} then @${firstRead}`;
}

interface GraphIndex {
	byId: Map<NodeId, MethodNode>;
	rawOut: Map<NodeId, CallEdge[]>;
}

function indexGraph(graph: CodeGraph): GraphIndex {
	const byId = new Map<NodeId, MethodNode>(
		graph.nodes.map((node) => [node.id, node])
	);
	const rawOut = new Map<NodeId, CallEdge[]>();
	for (const edge of graph.edges) {
		append(rawOut, edge.from, edge);
	}
	for (const list of rawOut.values()) {
		list.sort((a, b) => a.order - b.order);
	}
	return { byId, rawOut };
}

function sliceEndpoint(
	{ byId, rawOut }: GraphIndex,
	entry: EntryPoint
): DescentEndpoint {
	// Collects the nodes reachable from the entry, then indexes them locally.
	const localOf = new Map<NodeId, number>();
	const source: MethodNode[] = [];
	const queue: NodeId[] = [entry.node];
	while (queue.length > 0) {
		const id = queue.pop() as NodeId;
		if (localOf.has(id)) {
			continue;
		}
		const node = byId.get(id);
		if (!node) {
			continue;
		}
		localOf.set(id, source.length);
		source.push(node);
		for (const edge of rawOut.get(id) ?? []) {
			if (!localOf.has(edge.to)) {
				queue.push(edge.to);
			}
		}
	}

	const edges: DescentEdgeInfo[] = [];
	const outgoing = new Map<number, DescentEdgeInfo[]>();
	const edgeIndex = new Map<DescentEdgeInfo, number>();
	for (const node of source) {
		const from = localOf.get(node.id) as number;
		const local: DescentEdgeInfo[] = [];
		for (const edge of rawOut.get(node.id) ?? []) {
			const to = localOf.get(edge.to);
			if (to === undefined) {
				continue;
			}
			const info: DescentEdgeInfo = {
				awaited: edge.awaited,
				concurrent: edge.iterationKind === "concurrent",
				conditional: edge.conditional,
				from,
				guard: edge.guardThrow !== null,
				inTry: edge.tryRegion !== null,
				iteration: edge.iterationKind,
				line: edge.line,
				order: edge.order,
				to,
			};
			edgeIndex.set(info, edges.length);
			edges.push(info);
			local.push(info);
		}
		outgoing.set(from, local);
	}

	const entryIndex = localOf.get(entry.node) ?? 0;
	const depth = depthsFrom(entryIndex, outgoing, source.length);
	const nodes: DescentNode[] = source.map((node, index) => {
		const dbOp = node.kind === "db" ? dbOperation(node.methodName) : null;
		const throws = countThrows(node);
		return {
			className: node.className,
			depth: depth[index] as number,
			dbOp,
			effect: nodeEffect(node, dbOp, throws),
			endLine: node.endLine,
			filePath: node.filePath,
			id: node.id,
			kind: node.kind,
			label: nodeLabel(node),
			line: node.line,
			member: node.member ?? null,
			methodName: node.methodName,
			throws,
		};
	});

	const { truncated, walk } = walkFrom(entryIndex, outgoing, edgeIndex);

	const stepsOf: number[][] = source.map(() => []);
	for (const [index, step] of walk.entries()) {
		stepsOf[step.node]?.push(index);
	}

	const byDepth = new Map<number, number[]>();
	for (const [index, node] of nodes.entries()) {
		append(byDepth, node.depth, index);
	}
	const depths = [...byDepth.keys()].sort((a, b) => a - b);
	const tiers = depths.map((d) =>
		(byDepth.get(d) as number[]).slice().sort((a, b) => {
			const ka = stepsOf[a]?.[0] ?? Number.POSITIVE_INFINITY;
			const kb = stepsOf[b]?.[0] ?? Number.POSITIVE_INFINITY;
			return ka - kb || a - b;
		})
	);

	return {
		controllerClass: entry.controllerClass,
		depths,
		edges,
		handlerMethod: entry.handlerMethod,
		httpMethod: (entry.httpMethod || "GET").toUpperCase(),
		key: `${entry.controllerClass}.${entry.handlerMethod}:${entry.routePath}`,
		nodes,
		routePath: entry.routePath || "/",
		stepsOf,
		tiers,
		truncated,
		verdict: verdictOf(nodes, walk),
		walk,
	};
}

/** The slice of the graph one endpoint reaches, walked and tiered. */
export function buildEndpoint(
	graph: CodeGraph,
	entry: EntryPoint
): DescentEndpoint {
	return sliceEndpoint(indexGraph(graph), entry);
}

export function buildEndpoints(graph: CodeGraph): DescentEndpoint[] {
	const index = indexGraph(graph);
	return graph.entries.map((entry) => sliceEndpoint(index, entry));
}

/** Whose source the pane shows: the node's own body, or the call that reached it. */
export type PaneMode = "call" | "decl";

export interface PaneTarget {
	/** The call-expression line, when the target is a call site. */
	callLine: number | null;
	file: string;
	/** Inclusive line range of the method shown, or null when it has none. */
	range: [number, number] | null;
	/** Index of the node whose body is shown. */
	shownNode: number;
}

/**
 * Which source a node opens: a db, unresolved or external node at its call
 * site, anything else at its own declaration.
 */
export function defaultPaneMode(node: DescentNode): PaneMode {
	return node.kind === "db" ||
		node.kind === "unresolved" ||
		node.kind === "external"
		? "call"
		: "decl";
}

/**
 * Which visit of a node to open: the one asked for, else the one the playhead
 * is on, else the first.
 */
export function resolveVisit(
	endpoint: DescentEndpoint,
	node: number,
	explicit: number | undefined,
	playStep: number | null
): number | null {
	if (explicit !== undefined) {
		return explicit;
	}
	const visits = endpoint.stepsOf[node] ?? [];
	if (playStep !== null && visits.includes(playStep)) {
		return playStep;
	}
	return visits[0] ?? null;
}

/** The file and lines the pane should show for one node, in one mode. */
export function paneTarget(
	endpoint: DescentEndpoint,
	node: number,
	step: number | null,
	mode: PaneMode
): PaneTarget | null {
	const own = endpoint.nodes[node];
	if (!own) {
		return null;
	}
	if (mode === "decl") {
		return {
			callLine: null,
			file: own.filePath,
			range: own.line > 0 ? [own.line, Math.max(own.endLine, own.line)] : null,
			shownNode: node,
		};
	}
	const edge =
		step === null ? undefined : endpoint.edges[endpoint.walk[step]?.edge ?? -1];
	const caller = edge ? endpoint.nodes[edge.from] : undefined;
	if (!(edge && caller)) {
		return null;
	}
	return {
		callLine: edge.line,
		file: caller.filePath,
		range:
			caller.line > 0
				? [caller.line, Math.max(caller.endLine, caller.line)]
				: null,
		shownNode: edge.from,
	};
}

export interface FilterState {
	cats: ReadonlySet<StepCategory>;
	db: boolean;
	guard: boolean;
}

export const CATEGORIES: StepCategory[] = [
	"error",
	"warn",
	"log",
	"throw",
	"write",
	"read",
	"external",
	"call",
];

export const PRESETS: {
	cats: StepCategory[];
	db: boolean;
	guard: boolean;
	label: string;
	tip: string;
}[] = [
	{
		cats: CATEGORIES,
		db: false,
		guard: false,
		label: "all",
		tip: "every step of the walk",
	},
	{
		cats: ["throw", "write", "read", "external"],
		db: false,
		guard: false,
		label: "effects",
		tip: "write, read, throw and external — no logs, no plain calls",
	},
	{
		cats: ["throw", "warn", "error"],
		db: false,
		guard: true,
		label: "problems",
		tip: "throws, warns, errors, and every guarded call site",
	},
	{
		cats: ["throw", "write", "read", "external", "call"],
		db: false,
		guard: false,
		label: "no logs",
		tip: "everything except log, warn and error",
	},
	{
		cats: [],
		db: true,
		guard: false,
		label: "database",
		tip: "only the steps that land on a db node",
	},
];

export const ALL_PRESET = PRESETS.findIndex((preset) => preset.label === "all");
export const DATABASE_PRESET = PRESETS.findIndex(
	(preset) => preset.label === "database"
);

/** Walk length under which `defaultPreset` keeps every step. */
const SHORT_WALK = 7;

/** Walk steps that land on a db node. */
export function dbStepCount(endpoint: DescentEndpoint): number {
	const { other, reads, writes } = endpoint.verdict;
	return reads + writes + other;
}

/** `all` for a walk under `SHORT_WALK` or with no db step, `database` otherwise. */
export function defaultPreset(endpoint: DescentEndpoint): number {
	if (endpoint.walk.length < SHORT_WALK || dbStepCount(endpoint) === 0) {
		return ALL_PRESET;
	}
	return DATABASE_PRESET;
}

export function presetState(index: number): FilterState {
	const preset = PRESETS[index] ?? (PRESETS[0] as (typeof PRESETS)[number]);
	return {
		cats: new Set(preset.cats),
		db: preset.db,
		guard: preset.guard,
	};
}

function stepKept(
	endpoint: DescentEndpoint,
	step: DescentStep,
	filter: FilterState
): boolean {
	const node = endpoint.nodes[step.node];
	if (!node) {
		return false;
	}
	if (filter.cats.has(stepCategory(node))) {
		return true;
	}
	if (filter.guard && endpoint.edges[step.edge]?.guard) {
		return true;
	}
	return filter.db && node.dbOp !== null;
}

/** The step indices the filter keeps, in walk order. */
export function keptSteps(
	endpoint: DescentEndpoint,
	filter: FilterState
): number[] {
	const kept: number[] = [];
	for (const [index, step] of endpoint.walk.entries()) {
		if (stepKept(endpoint, step, filter)) {
			kept.push(index);
		}
	}
	return kept;
}

export function categoryCounts(
	endpoint: DescentEndpoint
): Record<StepCategory | "db" | "guard", number> {
	const counts = {
		call: 0,
		db: 0,
		error: 0,
		external: 0,
		guard: 0,
		log: 0,
		read: 0,
		throw: 0,
		warn: 0,
		write: 0,
	};
	for (const step of endpoint.walk) {
		const node = endpoint.nodes[step.node];
		if (!node) {
			continue;
		}
		counts[stepCategory(node)]++;
		if (endpoint.edges[step.edge]?.guard) {
			counts.guard++;
		}
		if (node.dbOp !== null) {
			counts.db++;
		}
	}
	return counts;
}

/** The marks one call site carries, in the order the step line shows them. */
export function stepFlags(
	endpoint: DescentEndpoint,
	step: DescentStep
): string[] {
	const flags: string[] = [];
	if (step.recursive) {
		flags.push("rec");
	} else if (step.revisit) {
		flags.push("again");
	}
	const edge = endpoint.edges[step.edge];
	if (!edge) {
		return flags;
	}
	if (!edge.awaited) {
		flags.push("not awaited");
	}
	if (edge.conditional) {
		flags.push("cond");
	}
	if (edge.inTry) {
		flags.push("try");
	}
	if (edge.guard) {
		flags.push("guard");
	}
	if (edge.concurrent) {
		flags.push("‖");
	}
	if (edge.iteration === "loop") {
		flags.push("loop");
	}
	if (edge.iteration === "callback") {
		flags.push("cb");
	}
	return flags;
}

export interface CardBox {
	h: number;
	w: number;
	x: number;
	y: number;
}

interface Wire {
	dash: string;
	edge: number;
	effect: Effect;
	/** The arrow head, as its own transform. */
	head: string;
	path: string;
	/** A second stroke below the first, for a concurrent call site. */
	twin: boolean;
}

export interface WireLayout {
	height: number;
	padBottom: number;
	wires: Wire[];
}

const LANE_TOP = 26;
const LANE_STEP = 22;
const LANE_MAX = 4;
const LANE_TAIL = 14;

/**
 * One wire per call site, over the boxes the flex layout placed. A call to an
 * equal or shallower depth routes through a lane under the last row.
 */
export function layoutWires(
	endpoint: DescentEndpoint,
	boxes: (CardBox | null)[]
): WireLayout {
	let bottom = 0;
	for (const box of boxes) {
		if (box) {
			bottom = Math.max(bottom, box.y + box.h);
		}
	}

	// Call sites grouped by their endpoint pair; each is bowed by its index.
	const siblings = new Map<string, number[]>();
	for (const [index, edge] of endpoint.edges.entries()) {
		append(siblings, `${edge.from}>${edge.to}`, index);
	}

	const isBack = (edge: DescentEdgeInfo): boolean =>
		edge.from === edge.to ||
		(endpoint.nodes[edge.to]?.depth ?? 0) <=
			(endpoint.nodes[edge.from]?.depth ?? 0);
	const backs = endpoint.edges.filter(isBack).length;
	const lanes = Math.min(backs, LANE_MAX);
	const padBottom =
		lanes > 0 ? LANE_TOP + (lanes - 1) * LANE_STEP + LANE_TAIL : 0;

	const wires: Wire[] = [];
	let lane = 0;
	for (const [index, edge] of endpoint.edges.entries()) {
		const a = boxes[edge.from];
		const b = boxes[edge.to];
		if (!(a && b)) {
			continue;
		}
		const group = siblings.get(`${edge.from}>${edge.to}`) ?? [index];
		const bow = (group.indexOf(index) - (group.length - 1) / 2) * 11;
		const back = isBack(edge);
		let path: string;
		let headX: number;
		let headY: number;
		let angle: number;
		if (back) {
			const laneY = bottom + LANE_TOP + (lane++ % LANE_MAX) * LANE_STEP + bow;
			const x1 = a.x + a.w * 0.34;
			const y1 = a.y + a.h;
			const x2 = b.x + b.w * 0.66;
			const y2 = b.y + b.h;
			path = `M${x1} ${y1} C${x1} ${laneY},${x2} ${laneY},${x2} ${y2}`;
			headX = x2;
			headY = y2;
			angle = -90;
		} else {
			const fx = a.x + a.w;
			const fy = a.y + a.h / 2;
			const tx = b.x - 7;
			const ty = b.y + b.h / 2;
			const bend = Math.max(30, (tx - fx) * 0.5);
			path = `M${fx} ${fy} C${fx + bend} ${fy + bow},${tx - bend} ${ty + bow},${tx} ${ty}`;
			headX = tx;
			headY = ty;
			angle = 0;
		}
		let dash = "5 4";
		if (edge.conditional) {
			dash = "8 5";
		} else if (back) {
			dash = "2 5";
		}
		wires.push({
			dash,
			edge: index,
			effect: endpoint.nodes[edge.to]?.effect ?? "plain",
			head: `translate(${headX},${headY}) rotate(${angle})`,
			path,
			twin: edge.concurrent,
		});
	}

	return { height: bottom + padBottom + 4, padBottom, wires };
}

/** One entry per pile row, newest first. Two or more hidden steps in a row fold into one; a lone one is dropped. */
export type PileItem =
	| { hidden: number; step?: undefined }
	| { hidden?: undefined; step: number };

/** The rows from step `top` down to 0, newest first. */
export function pileItems(kept: boolean[], top: number): PileItem[] {
	const out: PileItem[] = [];
	let run = 0;
	for (let j = top; j >= 0; j--) {
		if (kept.length > 0 && !kept[j]) {
			run++;
			continue;
		}
		if (run >= 2) {
			out.push({ hidden: run });
		}
		run = 0;
		out.push({ step: j });
	}
	if (run >= 2) {
		out.push({ hidden: run });
	}
	return out;
}
