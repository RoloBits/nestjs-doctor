import type {
	BodyItem,
	CallEdge,
	CodeGraph,
	EntryPoint,
	MethodNode,
	NodeId,
	NodeKind,
	UnresolvedReason,
} from "./code-graph.js";
import { staticNodeId } from "./code-graph.js";
import type {
	ConditionFrame,
	GuardThrow,
	MethodParameterInfo,
	StepStatement,
	SwaggerMetadata,
} from "./endpoint.js";

/**
 * The graph with its repetition taken out: file paths and node ids become
 * indices, and any field sitting at its default is left out entirely. Decoding
 * restores the graph exactly.
 */
export interface EncodedCodeGraph {
	edges: Record<string, unknown>[];
	entries: Record<string, unknown>[];
	files: string[];
	nodes: Record<string, unknown>[];
	version: 1;
}

/** Writes the field only when it differs from what decoding assumes. */
function put<T>(
	target: Record<string, unknown>,
	key: string,
	value: T,
	fallback: T
): void {
	if (value !== fallback) {
		target[key] = value;
	}
}

/** Writes the array only when it holds something. */
function putList<T>(
	target: Record<string, unknown>,
	key: string,
	value: T[]
): void {
	if (value.length > 0) {
		target[key] = value;
	}
}

class FileTable {
	readonly paths: string[] = [];
	private readonly indices = new Map<string, number>();

	index(path: string): number {
		const known = this.indices.get(path);
		if (known !== undefined) {
			return known;
		}
		const next = this.paths.length;
		this.paths.push(path);
		this.indices.set(path, next);
		return next;
	}
}

function encodeItem(item: BodyItem): Record<string, unknown> {
	const out: Record<string, unknown> = { k: item.kind, o: item.order };
	put(out, "l", item.line, 0);
	put(out, "bg", item.branchGroupId, null);
	put(out, "bk", item.branchKind, null);
	put(out, "cm", item.comment, null);
	put(out, "cd", item.conditional, false);
	putList(out, "cp", item.conditionPath);
	put(out, "ct", item.conditionText, null);
	put(out, "ik", item.iterationKind, null);
	put(out, "il", item.iterationLabel, null);
	put(out, "tr", item.tryRegion, null);
	if (item.kind === "throw") {
		out.ex = item.exceptionClass;
		put(out, "ms", item.message, null);
		put(out, "mg", item.mergedIntoCall, false);
	} else if (item.kind === "return") {
		put(out, "xp", item.expression, null);
	} else {
		putList(out, "st", item.statements);
	}
	return out;
}

function decodeItem(raw: Record<string, unknown>): BodyItem {
	const base = {
		branchGroupId: (raw.bg as string | null) ?? null,
		branchKind: (raw.bk as string | null) ?? null,
		comment: (raw.cm as string | null) ?? null,
		conditional: (raw.cd as boolean) ?? false,
		conditionPath: (raw.cp as ConditionFrame[]) ?? [],
		conditionText: (raw.ct as string | null) ?? null,
		iterationKind:
			(raw.ik as "loop" | "callback" | "concurrent" | null) ?? null,
		iterationLabel: (raw.il as string | null) ?? null,
		line: (raw.l as number) ?? 0,
		order: raw.o as number,
		tryRegion: (raw.tr as string | null) ?? null,
	};
	if (raw.k === "throw") {
		return {
			...base,
			exceptionClass: raw.ex as string,
			kind: "throw",
			mergedIntoCall: (raw.mg as boolean) ?? false,
			message: (raw.ms as string | null) ?? null,
		};
	}
	if (raw.k === "return") {
		return {
			...base,
			expression: (raw.xp as string | null) ?? null,
			kind: "return",
		};
	}
	return {
		...base,
		kind: "step",
		statements: (raw.st as StepStatement[]) ?? [],
	};
}

export function encodeCodeGraph(graph: CodeGraph): EncodedCodeGraph {
	const files = new FileTable();
	const indexOfNode = new Map<NodeId, number>();
	for (const [index, node] of graph.nodes.entries()) {
		indexOfNode.set(node.id, index);
	}

	const nodes = graph.nodes.map((node) => {
		const out: Record<string, unknown> = {
			c: node.className,
			f: files.index(node.filePath),
			k: node.kind,
			m: node.methodName,
		};
		put(out, "l", node.line, 0);
		put(out, "e", node.endLine, 0);
		put(out, "n", node.classMethodCount, 0);
		put(out, "r", node.returnType, null);
		putList(out, "p", node.parameters);
		putList(out, "y", node.body.map(encodeItem));
		if (node.member !== undefined) {
			out.b = node.member;
		}
		if (node.isStatic) {
			out.s = 1;
		}
		if (node.unresolved !== undefined) {
			out.u = node.unresolved;
		}
		return out;
	});

	// An endpoint left without a node would encode as a missing index and decode
	// into a crash, so anything that does not resolve is dropped here instead.
	const resolves = (id: NodeId) => indexOfNode.has(id);

	const edges = graph.edges
		.filter((edge) => resolves(edge.from) && resolves(edge.to))
		.map((edge) => {
			const out: Record<string, unknown> = {
				f: indexOfNode.get(edge.from),
				o: edge.order,
				t: indexOfNode.get(edge.to),
			};
			put(out, "l", edge.line, 0);
			put(out, "a", edge.assignedTo, null);
			put(out, "w", edge.awaited, false);
			put(out, "bg", edge.branchGroupId, null);
			put(out, "bk", edge.branchKind, null);
			put(out, "cm", edge.comment, null);
			put(out, "cd", edge.conditional, false);
			putList(out, "cp", edge.conditionPath);
			put(out, "ct", edge.conditionText, null);
			put(out, "gt", edge.guardThrow, null);
			put(out, "ik", edge.iterationKind, null);
			put(out, "il", edge.iterationLabel, null);
			put(out, "tr", edge.tryRegion, null);
			return out;
		});

	const entries = graph.entries
		.filter((entry) => resolves(entry.node))
		.map((entry) => {
			const out: Record<string, unknown> = {
				c: entry.controllerClass,
				h: entry.handlerMethod,
				m: entry.httpMethod,
				n: indexOfNode.get(entry.node),
				p: entry.routePath,
			};
			put(out, "r", entry.returnType, null);
			put(out, "s", entry.swagger, null);
			return out;
		});

	return { edges, entries, files: files.paths, nodes, version: 1 };
}

export function decodeCodeGraph(encoded: EncodedCodeGraph): CodeGraph {
	const nodes: MethodNode[] = encoded.nodes.map((raw) => {
		const filePath = encoded.files[raw.f as number];
		const className = raw.c as string;
		const methodName = raw.m as string;
		const member = raw.b as string | undefined;
		const isStatic = raw.s === 1;
		const suffix = member ? `${member}.${methodName}` : methodName;
		const node: MethodNode = {
			body: ((raw.y as Record<string, unknown>[]) ?? []).map(decodeItem),
			className,
			classMethodCount: (raw.n as number) ?? 0,
			endLine: (raw.e as number) ?? 0,
			filePath,
			id: isStatic
				? staticNodeId(filePath, className, methodName)
				: `${filePath}::${className}#${suffix}`,
			kind: raw.k as NodeKind,
			line: (raw.l as number) ?? 0,
			methodName,
			parameters: (raw.p as MethodParameterInfo[]) ?? [],
			returnType: (raw.r as string | null) ?? null,
			...(member === undefined ? {} : { member }),
			...(isStatic ? { isStatic: true as const } : {}),
			...(raw.u === undefined ? {} : { unresolved: raw.u as UnresolvedReason }),
		};
		return node;
	});

	const edges: CallEdge[] = encoded.edges.map((raw) => ({
		assignedTo: (raw.a as string | null) ?? null,
		awaited: (raw.w as boolean) ?? false,
		branchGroupId: (raw.bg as string | null) ?? null,
		branchKind: (raw.bk as string | null) ?? null,
		comment: (raw.cm as string | null) ?? null,
		conditional: (raw.cd as boolean) ?? false,
		conditionPath: (raw.cp as ConditionFrame[]) ?? [],
		conditionText: (raw.ct as string | null) ?? null,
		from: nodes[raw.f as number].id,
		guardThrow: (raw.gt as GuardThrow | null) ?? null,
		iterationKind:
			(raw.ik as "loop" | "callback" | "concurrent" | null) ?? null,
		iterationLabel: (raw.il as string | null) ?? null,
		line: (raw.l as number) ?? 0,
		order: raw.o as number,
		to: nodes[raw.t as number].id,
		tryRegion: (raw.tr as string | null) ?? null,
	}));

	const entries: EntryPoint[] = encoded.entries.map((raw) => ({
		controllerClass: raw.c as string,
		handlerMethod: raw.h as string,
		httpMethod: raw.m as string,
		node: nodes[raw.n as number].id,
		returnType: (raw.r as string | null) ?? null,
		routePath: raw.p as string,
		swagger: (raw.s as SwaggerMetadata | null) ?? null,
	}));

	return { edges, entries, nodes };
}
