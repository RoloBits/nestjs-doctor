import type {
	ClassDeclaration,
	MethodDeclaration,
	Node,
	Project,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	BodyItem,
	CallEdge,
	CodeGraph,
	EntryPoint,
	MethodNode,
	NodeId,
	NodeKind,
	UnresolvedReason,
} from "../../common/code-graph.js";
import { nodeId } from "../../common/code-graph.js";
import type {
	ConditionFrame,
	EndpointNode,
	GuardThrow,
} from "../../common/endpoint.js";
import {
	declaresRoutes,
	getClassType,
	isInjectable,
} from "../nest-class-inspector.js";
import {
	buildInjectionMap,
	classifyDependency,
	extractMethodParameters,
	extractReturnType,
	findMethodInHierarchy,
	ScanCache,
	scanUsedDependencies,
} from "./endpoint-graph.js";
import type { ProviderInfo } from "./type-resolver.js";
import { extractSimpleTypeName } from "./type-resolver.js";

// Injecting one of these makes the enclosing class a repository whatever it is named.
const DRIVER_ROOTS = new Set([
	"PrismaService",
	"DatabaseService",
	"DataSource",
	"EntityManager",
	"MikroORM",
	"Knex",
	"Sequelize",
	"Connection",
]);

const DECORATOR_KINDS: Record<string, NodeKind> = {
	controller: "controller",
	filter: "filter",
	gateway: "gateway",
	guard: "guard",
	interceptor: "interceptor",
	pipe: "pipe",
	resolver: "resolver",
};

const SUFFIX_KINDS: Record<string, NodeKind> = {
	filter: "filter",
	gateway: "gateway",
	guard: "guard",
	interceptor: "interceptor",
	pipe: "pipe",
	repository: "repository",
	service: "service",
};

interface IndexedClass {
	cls: ClassDeclaration;
	filePath: string;
	name: string;
}

/** Where a receiver's declared type led, or why it led nowhere. */
interface ResolvedReceiver {
	cls?: ClassDeclaration;
	reason?: UnresolvedReason;
	typeName: string;
}

/** The call-site fields every usage kind carries. */
interface CallSiteFacts {
	assignedTo: string | null;
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	guardThrow?: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	order: number;
	tryRegion: string | null;
}

function baseClassOf(cls: ClassDeclaration): ClassDeclaration | undefined {
	try {
		return cls.getBaseClass();
	} catch {
		return undefined;
	}
}

function classKind(cls: ClassDeclaration): NodeKind {
	const fromDecorator = DECORATOR_KINDS[getClassType(cls)];
	if (fromDecorator) {
		return fromDecorator;
	}
	const injectsDriver = cls
		.getConstructors()[0]
		?.getParameters()
		.some((param) =>
			DRIVER_ROOTS.has(
				extractSimpleTypeName(
					param.getTypeNode()?.getText() ?? param.getType().getText()
				)
			)
		);
	if (injectsDriver) {
		return "repository";
	}
	return SUFFIX_KINDS[classifyDependency(cls.getName() ?? "")] ?? "service";
}

/** The declared type node of an injected constructor parameter or `@Inject()` property. */
function injectedTypeNode(
	cls: ClassDeclaration,
	memberName: string
): Node | undefined {
	for (const prop of cls.getProperties()) {
		if (prop.getName() === memberName && prop.getDecorator("Inject")) {
			return prop.getTypeNode();
		}
	}
	let current: ClassDeclaration | undefined = cls;
	const seen = new Set<string>();
	while (current) {
		const name = current.getName() ?? "";
		if (seen.has(name)) {
			return undefined;
		}
		seen.add(name);
		const ctor = current.getConstructors()[0];
		if (ctor) {
			return ctor
				.getParameters()
				.find((param) => param.getName() === memberName)
				?.getTypeNode();
		}
		current = baseClassOf(current);
	}
	return undefined;
}

function resolveTypeNode(
	typeNode: Node | undefined,
	providers: Map<string, ProviderInfo>
): ResolvedReceiver {
	if (!typeNode) {
		return { reason: "receiver-unknown", typeName: "" };
	}
	const ref = typeNode.asKind(SyntaxKind.TypeReference);
	if (!ref) {
		return {
			reason: "receiver-unknown",
			typeName: extractSimpleTypeName(typeNode.getText()),
		};
	}
	const typeName = extractSimpleTypeName(ref.getTypeName().getText());
	const symbol = ref.getTypeName().getSymbol();
	const declarations = (
		symbol?.getAliasedSymbol() ?? symbol
	)?.getDeclarations();
	let sawTypeOnly = false;
	for (const decl of declarations ?? []) {
		const asClass = decl.asKind(SyntaxKind.ClassDeclaration);
		if (asClass) {
			return { cls: asClass, typeName };
		}
		if (
			decl.getKind() === SyntaxKind.InterfaceDeclaration ||
			decl.getKind() === SyntaxKind.TypeAliasDeclaration
		) {
			sawTypeOnly = true;
		}
	}
	const provider = providers.get(typeName);
	if (provider) {
		return { cls: provider.classDeclaration, typeName };
	}
	return {
		reason: sawTypeOnly ? "interface-token" : "external-package",
		typeName,
	};
}

class GraphBuilder {
	readonly edges: CallEdge[] = [];
	private readonly nodes = new Map<NodeId, MethodNode>();
	private readonly kinds = new Map<ClassDeclaration, NodeKind>();

	constructor(private readonly providers: Map<string, ProviderInfo>) {}

	list(): MethodNode[] {
		return [...this.nodes.values()];
	}

	kindOf(cls: ClassDeclaration): NodeKind {
		const cached = this.kinds.get(cls);
		if (cached) {
			return cached;
		}
		const kind = cls.getSourceFile().getFilePath().includes("/node_modules/")
			? "external"
			: classKind(cls);
		this.kinds.set(cls, kind);
		return kind;
	}

	declared(cls: ClassDeclaration, method: MethodDeclaration): NodeId {
		const filePath = cls.getSourceFile().getFilePath();
		const className = cls.getName() ?? "";
		const id = nodeId(filePath, className, method.getName());
		if (!this.nodes.has(id)) {
			this.nodes.set(id, {
				body: [],
				className,
				classMethodCount: cls.getInstanceMethods().length,
				endLine: method.getEndLineNumber(),
				filePath,
				id,
				kind: this.kindOf(cls),
				line: method.getStartLineNumber(),
				methodName: method.getName(),
				parameters: extractMethodParameters(method),
				returnType: extractReturnType(method),
			});
		}
		return id;
	}

	synthetic(node: Omit<MethodNode, "id">, member?: string): NodeId {
		const id = nodeId(node.filePath, node.className, node.methodName, member);
		if (!this.nodes.has(id)) {
			this.nodes.set(id, { ...node, id });
		}
		return id;
	}

	setBody(id: NodeId, body: BodyItem[]): void {
		const node = this.nodes.get(id);
		if (node) {
			node.body = body;
		}
	}

	/** The node a `this.<member>.<method>()` call reaches, resolved or not. */
	callee(
		receiver: ResolvedReceiver,
		methodName: string,
		fallbackName: string
	): NodeId {
		if (!receiver.cls) {
			return this.unresolved(
				"",
				receiver.typeName || fallbackName,
				methodName,
				receiver.reason ?? "receiver-unknown"
			);
		}
		const method = findMethodInHierarchy(
			receiver.cls,
			methodName,
			this.providers
		);
		if (!method) {
			return this.unresolved(
				receiver.cls.getSourceFile().getFilePath(),
				receiver.cls.getName() ?? receiver.typeName,
				methodName,
				"method-not-found"
			);
		}
		const owner =
			method.getParentIfKind(SyntaxKind.ClassDeclaration) ?? receiver.cls;
		return this.declared(owner, method);
	}

	// ponytail: a two-level receiver reads as a db member, so a field holding
	// another service becomes `Wrapper#inner.doThing`; check the member's type to lift it.
	db(
		receiver: ResolvedReceiver,
		member: string,
		methodName: string,
		fallbackName: string
	): NodeId {
		const cls = receiver.cls;
		return this.synthetic(
			{
				body: [],
				className: cls?.getName() ?? (receiver.typeName || fallbackName),
				classMethodCount: 0,
				endLine: 0,
				filePath: cls?.getSourceFile().getFilePath() ?? "",
				kind: cls ? "db" : "unresolved",
				line: 0,
				member,
				methodName,
				parameters: [],
				returnType: null,
				...(cls ? {} : { unresolved: receiver.reason ?? "receiver-unknown" }),
			},
			member
		);
	}

	private unresolved(
		filePath: string,
		className: string,
		methodName: string,
		reason: UnresolvedReason
	): NodeId {
		return this.synthetic({
			body: [],
			className,
			classMethodCount: 0,
			endLine: 0,
			filePath,
			kind: "unresolved",
			line: 0,
			methodName,
			parameters: [],
			returnType: null,
			unresolved: reason,
		});
	}

	edge(from: NodeId, to: NodeId, facts: CallSiteFacts): void {
		this.edges.push({
			assignedTo: facts.assignedTo,
			awaited: facts.awaited,
			branchGroupId: facts.branchGroupId,
			branchKind: facts.branchKind,
			comment: facts.comment,
			conditional: facts.conditional,
			conditionPath: facts.conditionPath,
			conditionText: facts.conditionText,
			from,
			guardThrow: facts.guardThrow ?? null,
			iterationKind: facts.iterationKind,
			iterationLabel: facts.iterationLabel,
			line: facts.callSiteLine,
			order: facts.order,
			to,
			tryRegion: facts.tryRegion,
		});
	}
}

function indexClasses(project: Project, files: string[]): IndexedClass[] {
	const indexed: IndexedClass[] = [];
	const seen = new Set<string>();
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		for (const cls of sourceFile.getClasses()) {
			const name = cls.getName();
			if (!(name && (isInjectable(cls) || declaresRoutes(cls)))) {
				continue;
			}
			const resolved = sourceFile.getFilePath();
			const key = `${resolved}::${name}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			indexed.push({ cls, filePath: resolved, name });
		}
	}
	return indexed;
}

function bodyItems(scan: ReturnType<typeof scanUsedDependencies>): BodyItem[] {
	const items: BodyItem[] = [];
	for (const thrown of scan.throws) {
		items.push({
			branchGroupId: thrown.branchGroupId,
			branchKind: thrown.branchKind,
			comment: thrown.comment,
			conditional: thrown.conditional,
			conditionPath: thrown.conditionPath,
			conditionText: thrown.conditionText,
			exceptionClass: thrown.exceptionClassName,
			iterationKind: thrown.iterationKind,
			iterationLabel: thrown.iterationLabel,
			kind: "throw",
			mergedIntoCall: thrown.merged === true,
			tryRegion: thrown.tryRegion,
			line: thrown.callSiteLine,
			message: thrown.message,
			order: thrown.order,
		});
	}
	for (const returned of scan.returns) {
		items.push({
			branchGroupId: returned.branchGroupId,
			branchKind: returned.branchKind,
			comment: returned.comment,
			conditional: returned.conditional,
			conditionPath: returned.conditionPath,
			conditionText: returned.conditionText,
			expression: returned.expression,
			iterationKind: returned.iterationKind,
			iterationLabel: returned.iterationLabel,
			kind: "return",
			tryRegion: returned.tryRegion,
			line: returned.callSiteLine,
			order: returned.order,
		});
	}
	for (const step of scan.steps) {
		items.push({
			branchGroupId: step.branchGroupId,
			branchKind: step.branchKind,
			comment: step.comment,
			conditional: step.conditional,
			conditionPath: step.conditionPath,
			conditionText: step.conditionText,
			iterationKind: step.iterationKind,
			iterationLabel: step.iterationLabel,
			kind: "step",
			tryRegion: step.tryRegion,
			line: step.callSiteLine,
			order: step.order,
			statements: step.statements,
		});
	}
	return items.sort((a, b) => a.order - b.order);
}

/** The first injected member declared with `typeName`; several share one declaration. */
function memberOfType(
	injectionMap: Map<string, string>,
	typeName: string
): string {
	for (const [member, type] of injectionMap) {
		if (type === typeName) {
			return member;
		}
	}
	return typeName;
}

function scanClass(
	indexed: IndexedClass,
	builder: GraphBuilder,
	providers: Map<string, ProviderInfo>
): void {
	// One cache per class: its keys are class names, which collide across files.
	const cache = new ScanCache();
	const injectionMap = buildInjectionMap(indexed.cls, providers, cache);
	const receivers = new Map<string, ResolvedReceiver>();
	const receiverFor = (member: string): ResolvedReceiver => {
		const cached = receivers.get(member);
		if (cached) {
			return cached;
		}
		const resolved = resolveTypeNode(
			injectedTypeNode(indexed.cls, member),
			providers
		);
		receivers.set(member, resolved);
		return resolved;
	};

	for (const method of indexed.cls.getInstanceMethods()) {
		const from = builder.declared(indexed.cls, method);
		const scan = scanUsedDependencies(
			method,
			injectionMap,
			indexed.cls,
			undefined,
			cache,
			{
				everyThisCall: true,
				keepMergedThrows: true,
				memberCalls: true,
				returns: true,
				skipChildScan: true,
			}
		);
		builder.setBody(from, bodyItems(scan));

		for (const dep of scan.deps) {
			const member = memberOfType(injectionMap, dep.className);
			const receiver = receiverFor(member);
			for (const call of dep.methodsCalled) {
				builder.edge(
					from,
					builder.callee(receiver, call.name, dep.className),
					call
				);
			}
		}

		for (const call of scan.memberCalls) {
			const receiver = receiverFor(call.paramName);
			builder.edge(
				from,
				builder.db(receiver, call.member, call.methodName, call.paramName),
				call
			);
		}

		for (const call of scan.sameClassCalls) {
			// `super.m()` targets the base declaration even when this class overrides it.
			const start = call.viaSuper ? baseClassOf(indexed.cls) : indexed.cls;
			const target = start
				? findMethodInHierarchy(start, call.methodName, providers, cache)
				: undefined;
			if (target) {
				const owner =
					target.getParentIfKind(SyntaxKind.ClassDeclaration) ?? indexed.cls;
				builder.edge(from, builder.declared(owner, target), call);
			}
		}
	}
}

function compareNodes(a: MethodNode, b: MethodNode): number {
	return (
		a.filePath.localeCompare(b.filePath) ||
		a.className.localeCompare(b.className) ||
		a.line - b.line ||
		a.methodName.localeCompare(b.methodName) ||
		(a.member ?? "").localeCompare(b.member ?? "")
	);
}

function compareEdges(a: CallEdge, b: CallEdge): number {
	return (
		a.from.localeCompare(b.from) ||
		a.order - b.order ||
		a.to.localeCompare(b.to)
	);
}

function buildEntries(
	project: Project,
	endpoints: EndpointNode[]
): EntryPoint[] {
	return endpoints
		.map((endpoint) => ({
			controllerClass: endpoint.controllerClass,
			handlerMethod: endpoint.handlerMethod,
			httpMethod: endpoint.httpMethod,
			node: nodeId(
				project.getSourceFile(endpoint.filePath)?.getFilePath() ??
					endpoint.filePath,
				endpoint.controllerClass,
				endpoint.handlerMethod
			),
			returnType: endpoint.returnType,
			routePath: endpoint.routePath,
			swagger: endpoint.swagger,
		}))
		.sort(
			(a, b) =>
				a.node.localeCompare(b.node) ||
				a.httpMethod.localeCompare(b.httpMethod) ||
				a.routePath.localeCompare(b.routePath)
		);
}

/**
 * One node per declared method of every Nest class, with each call site as an
 * edge. Cycles are edges, so nothing is expanded twice.
 */
export function buildCodeGraph(
	project: Project,
	files: string[],
	providers: Map<string, ProviderInfo>,
	endpoints: EndpointNode[]
): CodeGraph {
	const builder = new GraphBuilder(providers);
	const indexed = indexClasses(project, files);

	for (const entry of indexed) {
		for (const method of entry.cls.getInstanceMethods()) {
			builder.declared(entry.cls, method);
		}
	}
	for (const entry of indexed) {
		scanClass(entry, builder, providers);
	}

	return {
		edges: builder.edges.sort(compareEdges),
		entries: buildEntries(project, endpoints),
		nodes: builder.list().sort(compareNodes),
	};
}
