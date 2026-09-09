import type {
	ConditionFrame,
	GuardThrow,
	MethodParameterInfo,
	StepStatement,
	SwaggerMetadata,
} from "./endpoint.js";

/**
 * `${path}::${ClassName}#${methodName}`, where `path` is the declaring file, an
 * import specifier for an installed package, or empty when neither is known.
 * A `${member}.` sits before the method name on a member call, a static
 * separates with `.` instead of `#`, and a free function leaves the class
 * empty.
 */
export type NodeId = string;

export type NodeKind =
	| "controller"
	| "resolver"
	| "gateway"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter"
	| "repository"
	| "service"
	| "db"
	| "external"
	| "function"
	| "unresolved";

export type UnresolvedReason =
	| "external-package"
	| "interface-token"
	| "receiver-unknown"
	| "method-not-found";

interface BodyItemBase {
	branchGroupId: string | null;
	branchKind: string | null;
	comment: string | null;
	conditional: boolean;
	/** Every enclosing construct, outermost first. Empty when unconditional. */
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	line: number;
	/** Shares one sequence with the outgoing `CallEdge.order` of the same node. */
	order: number;
	/**
	 * Group of the `try` block holding this item, matching the `branchGroupId` of
	 * the `catch` that handles it. Null everywhere else, a `catch` or `finally`
	 * body and a `try` without a `catch` included.
	 */
	tryRegion: string | null;
}

interface ThrowItem extends BodyItemBase {
	exceptionClass: string;
	kind: "throw";
	/**
	 * The `guardThrow` of an earlier call repeats this throw, so a view can show
	 * the fetch, its null check and this exception as one step.
	 */
	mergedIntoCall: boolean;
	message: string | null;
}

interface StepItem extends BodyItemBase {
	kind: "step";
	statements: StepStatement[];
}

/** A `return` of the method itself, early or final. */
interface ReturnItem extends BodyItemBase {
	/** The returned expression, null for a bare `return`. */
	expression: string | null;
	kind: "return";
}

/** The ordered parts of a method body that are not calls. */
export type BodyItem = ReturnItem | StepItem | ThrowItem;

export interface MethodNode {
	body: BodyItem[];
	classMethodCount: number;
	className: string;
	endLine: number;
	filePath: string;
	id: NodeId;
	/** Reached through the class rather than an instance. */
	isStatic?: true;
	kind: NodeKind;
	line: number;
	/** Property the call went through: `user` in `this.prisma.user.find()`. */
	member?: string;
	methodName: string;
	parameters: MethodParameterInfo[];
	returnType: string | null;
	/** Set when the callee could not be resolved to a declaration. */
	unresolved?: UnresolvedReason;
}

/** One call site. Two calls to one callee from one body are two edges. */
export interface CallEdge {
	assignedTo: string | null;
	/**
	 * True when the call site is itself awaited. A call handed to `Promise.all`
	 * is false; `iterationKind` is what says its promise is collected.
	 */
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	comment: string | null;
	conditional: boolean;
	/** Every enclosing construct, outermost first. Empty when unconditional. */
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	from: NodeId;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	line: number;
	order: number;
	to: NodeId;
	/**
	 * Group of the `try` block holding this call, matching the `branchGroupId` of
	 * the `catch` that handles it. Null everywhere else, a `catch` or `finally`
	 * body and a `try` without a `catch` included.
	 */
	tryRegion: string | null;
}

export interface EntryPoint {
	controllerClass: string;
	handlerMethod: string;
	httpMethod: string;
	node: NodeId;
	returnType: string | null;
	routePath: string;
	swagger: SwaggerMetadata | null;
}

/** Every indexed method once, with the call sites between them as edges. */
export interface CodeGraph {
	edges: CallEdge[];
	entries: EntryPoint[];
	nodes: MethodNode[];
}

export function nodeId(
	filePath: string,
	className: string,
	methodName: string,
	member?: string
): NodeId {
	const suffix = member ? `${member}.${methodName}` : methodName;
	return `${filePath}::${className}#${suffix}`;
}

/**
 * A method reached through the class rather than an instance. The `.` keeps it
 * apart from an instance method of the same name.
 */
export function staticNodeId(
	filePath: string,
	className: string,
	methodName: string
): NodeId {
	return `${filePath}::${className}.${methodName}`;
}

export function indexNodes(graph: CodeGraph): Map<NodeId, MethodNode> {
	return new Map(graph.nodes.map((node) => [node.id, node]));
}

export function outgoing(graph: CodeGraph): Map<NodeId, CallEdge[]> {
	const byFrom = new Map<NodeId, CallEdge[]>();
	for (const edge of graph.edges) {
		const list = byFrom.get(edge.from);
		if (list) {
			list.push(edge);
		} else {
			byFrom.set(edge.from, [edge]);
		}
	}
	return byFrom;
}

/** Every node reachable from `entryIds`, the entries themselves included. */
export function reachableFrom(
	graph: CodeGraph,
	entryIds: Iterable<NodeId>
): Set<NodeId> {
	const byFrom = outgoing(graph);
	const seen = new Set<NodeId>();
	const queue = [...entryIds];
	while (queue.length > 0) {
		const id = queue.pop();
		if (id === undefined || seen.has(id)) {
			continue;
		}
		seen.add(id);
		for (const edge of byFrom.get(id) ?? []) {
			if (!seen.has(edge.to)) {
				queue.push(edge.to);
			}
		}
	}
	return seen;
}
