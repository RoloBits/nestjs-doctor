import type {
	ClassDeclaration,
	MethodDeclaration,
	Node,
	Project,
	TypeReferenceNode,
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
import { nodeId, staticNodeId } from "../../common/code-graph.js";
import type {
	ConditionFrame,
	EndpointNode,
	GuardThrow,
} from "../../common/endpoint.js";
import {
	declaresRoutes,
	getClassType,
	isController,
	isInjectable,
} from "../nest-class-inspector.js";
import type { FreeCallTarget } from "./endpoint-graph.js";
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
	/** File declaring the type, so two same-named interfaces stay apart. */
	filePath?: string;
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
	// A wrapper composing `Controller()` carries its own name, so the decorator
	// names alone would read it as a plain service.
	if (isController(cls)) {
		return "controller";
	}
	const declared = getClassType(cls);
	const fromDecorator = DECORATOR_KINDS[declared];
	if (fromDecorator) {
		return fromDecorator;
	}
	// Nest reads route metadata off the prototype chain, so an undecorated base
	// declaring handlers is a controller. A class that named its own kind is not,
	// whatever its method decorators look like.
	if (declared === "unknown" && declaresRoutes(cls)) {
		return "controller";
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

/** The name a type declaration gives itself, ignoring how a caller imported it. */
function declaredTypeName(declaration: Node): string | undefined {
	return (
		declaration.asKind(SyntaxKind.InterfaceDeclaration)?.getName() ??
		declaration.asKind(SyntaxKind.TypeAliasDeclaration)?.getName()
	);
}

/** The name actually bound in scope: `pkgOne` in `pkgOne.Client`. */
function boundName(ref: TypeReferenceNode): string {
	const typeName = ref.getTypeName();
	return (
		typeName
			.asKind(SyntaxKind.QualifiedName)
			?.getLeft()
			.getText()
			.split(".")[0] ?? typeName.getText()
	);
}

/**
 * The package a name was imported from, used to tell two packages apart. A
 * relative specifier names no package and repeats across directories, so it is
 * not an identity and yields nothing.
 */
function importSpecifier(ref: Node, name: string): string | undefined {
	for (const declaration of ref.getSourceFile().getImportDeclarations()) {
		const named = declaration
			.getNamedImports()
			.some(
				(entry) =>
					(entry.getAliasNode() ?? entry.getNameNode()).getText() === name
			);
		const defaulted = declaration.getDefaultImport()?.getText() === name;
		const namespaced = declaration.getNamespaceImport()?.getText() === name;
		if (named || defaulted || namespaced) {
			const specifier = declaration.getModuleSpecifierValue();
			return specifier.startsWith(".") || specifier.startsWith("/")
				? undefined
				: specifier;
		}
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
	const written = extractSimpleTypeName(ref.getTypeName().getText());
	const symbol = ref.getTypeName().getSymbol();
	const declarations = (
		symbol?.getAliasedSymbol() ?? symbol
	)?.getDeclarations();
	let typeOnly: Node | undefined;
	for (const decl of declarations ?? []) {
		const asClass = decl.asKind(SyntaxKind.ClassDeclaration);
		if (asClass) {
			return { cls: asClass, typeName: asClass.getName() ?? written };
		}
		if (
			decl.getKind() === SyntaxKind.InterfaceDeclaration ||
			decl.getKind() === SyntaxKind.TypeAliasDeclaration
		) {
			typeOnly ??= decl;
		}
	}
	const provider = providers.get(written);
	if (provider) {
		return { cls: provider.classDeclaration, typeName: written };
	}
	if (typeOnly) {
		// The declaration's own name, so an import alias does not split the node.
		const declared = declaredTypeName(typeOnly);
		return {
			filePath: typeOnly.getSourceFile().getFilePath(),
			reason: "interface-token",
			typeName: declared ?? written,
		};
	}
	// Installed packages are hidden from resolution, so the import specifier is
	// the only thing separating two packages exporting one name.
	const specifier = importSpecifier(ref, boundName(ref));
	return {
		...(specifier ? { filePath: specifier } : {}),
		reason: "external-package",
		typeName: written,
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
				receiver.filePath ?? "",
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

	/** The node a `this.<member>.<method>()` call reaches. */
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
				filePath: cls?.getSourceFile().getFilePath() ?? receiver.filePath ?? "",
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

	/**
	 * The node a `helper()` or `Klass.helper()` call reaches. Returns nothing
	 * when the declaration has since gone, so no edge dangles.
	 */
	free(project: Project, target: FreeCallTarget): NodeId | undefined {
		const source = project.getSourceFile(target.filePath);
		if (!source) {
			return undefined;
		}
		if (target.isStatic) {
			const cls = source.getClass(target.className);
			const method = cls?.getStaticMethod(target.methodName);
			if (!(cls && method)) {
				return undefined;
			}
			const id = staticNodeId(
				target.filePath,
				target.className,
				target.methodName
			);
			if (!this.nodes.has(id)) {
				this.nodes.set(id, {
					body: [],
					className: target.className,
					classMethodCount: cls.getStaticMethods().length,
					endLine: method.getEndLineNumber(),
					filePath: target.filePath,
					id,
					isStatic: true,
					kind: "function",
					line: method.getStartLineNumber(),
					methodName: target.methodName,
					parameters: extractMethodParameters(method),
					returnType: extractReturnType(method),
				});
			}
			return id;
		}
		const fn = source.getFunction(target.methodName);
		if (!fn) {
			return undefined;
		}
		const id = nodeId(target.filePath, "", target.methodName);
		if (!this.nodes.has(id)) {
			this.nodes.set(id, {
				body: [],
				className: "",
				classMethodCount: 0,
				endLine: fn.getEndLineNumber(),
				filePath: target.filePath,
				id,
				kind: "function",
				line: fn.getStartLineNumber(),
				methodName: target.methodName,
				parameters: extractMethodParameters(fn),
				returnType: extractReturnType(fn),
			});
		}
		return id;
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

function scanClass(
	indexed: IndexedClass,
	builder: GraphBuilder,
	providers: Map<string, ProviderInfo>,
	project: Project
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
				freeCalls: true,
				keepMergedThrows: true,
				memberCalls: true,
				returns: true,
				skipChildScan: true,
			}
		);
		builder.setBody(from, bodyItems(scan));

		for (const dep of scan.deps) {
			for (const call of dep.methodsCalled) {
				// Resolve per call site: two members can share a simple type name
				// while pointing at different declarations.
				const receiver = receiverFor(call.member);
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

		for (const call of scan.freeCalls) {
			const target = builder.free(project, call);
			if (target) {
				builder.edge(from, target, call);
			}
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

/**
 * One entry per endpoint whose handler was indexed. The endpoint extractor
 * names an anonymous class `AnonymousController` and reads static handlers,
 * neither of which becomes a node, so those endpoints carry no entry.
 */
function buildEntries(
	project: Project,
	endpoints: EndpointNode[],
	known: ReadonlySet<NodeId>
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
		.filter((entry) => known.has(entry.node))
		.sort(
			(a, b) =>
				a.node.localeCompare(b.node) ||
				a.httpMethod.localeCompare(b.httpMethod) ||
				a.routePath.localeCompare(b.routePath)
		);
}

/**
 * True when `candidate` describes the method better than `known`. A sub-project
 * that only calls a method records it without a body, so the sub-project that
 * declares it wins whatever order they merge in.
 */
function preferNode(candidate: MethodNode, known: MethodNode): boolean {
	if (candidate.body.length !== known.body.length) {
		return candidate.body.length > known.body.length;
	}
	// Total and order independent, so equal-length bodies still pick one winner.
	return JSON.stringify(candidate.body) < JSON.stringify(known.body);
}

/**
 * True when `candidate` names the call's target better than `known`. A
 * sub-project that cannot see the callee's file resolves it to an unresolved
 * node, and a lexicographic tie-break keeps the result order independent.
 */
function preferEdge(
	candidate: CallEdge,
	known: CallEdge,
	resolved: (id: NodeId) => boolean
): boolean {
	if (resolved(candidate.to) !== resolved(known.to)) {
		return resolved(candidate.to);
	}
	return candidate.to < known.to;
}

/**
 * One graph from several, for a monorepo scanned a sub-project at a time. A
 * method two sub-projects both reach through a shared library is one node, and
 * the result does not depend on the order the sub-projects arrive in.
 */
export function mergeCodeGraphs(graphs: Iterable<CodeGraph>): CodeGraph {
	const nodes = new Map<NodeId, MethodNode>();
	const edges = new Map<string, CallEdge>();
	const entries = new Map<string, EntryPoint>();
	const all = [...graphs];
	for (const graph of all) {
		for (const node of graph.nodes) {
			const known = nodes.get(node.id);
			if (!known || preferNode(node, known)) {
				nodes.set(node.id, node);
			}
		}
	}
	// One call site is one edge. A sub-project that cannot see the callee's file
	// resolves it to an unresolved node, so the sub-project that can wins.
	const resolved = (id: NodeId) => {
		const kind = nodes.get(id)?.kind;
		return kind !== undefined && kind !== "unresolved";
	};
	for (const graph of all) {
		for (const edge of graph.edges) {
			const key = `${edge.from}|${edge.order}`;
			const known = edges.get(key);
			if (!known || preferEdge(edge, known, resolved)) {
				edges.set(key, edge);
			}
		}
		for (const entry of graph.entries) {
			const key = `${entry.httpMethod} ${entry.routePath} ${entry.node}`;
			if (!entries.has(key)) {
				entries.set(key, entry);
			}
		}
	}
	return {
		edges: [...edges.values()].sort(compareEdges),
		entries: [...entries.values()].sort(
			(a, b) =>
				a.node.localeCompare(b.node) ||
				a.httpMethod.localeCompare(b.httpMethod) ||
				a.routePath.localeCompare(b.routePath)
		),
		nodes: [...nodes.values()].sort(compareNodes),
	};
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
		scanClass(entry, builder, providers, project);
	}

	const nodes = builder.list().sort(compareNodes);
	return {
		edges: builder.edges.sort(compareEdges),
		entries: buildEntries(
			project,
			endpoints,
			new Set(nodes.map((node) => node.id))
		),
		nodes,
	};
}
