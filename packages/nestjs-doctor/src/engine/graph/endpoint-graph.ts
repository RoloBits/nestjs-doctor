import type {
	CallExpression,
	ClassDeclaration,
	Decorator,
	FunctionDeclaration,
	IfStatement,
	MethodDeclaration,
	Node,
	Project,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	ApiBodyInfo,
	ApiParamInfo,
	ApiResponseInfo,
	BranchKind,
	ConditionFrame,
	DependencyType,
	EndpointGraph,
	EndpointNode,
	GuardThrow,
	MethodCallNode,
	MethodDependencyNode,
	MethodParameterInfo,
	StepStatement,
	SwaggerMetadata,
} from "../../common/endpoint.js";
import { MAX_DEPENDENCY_NODES } from "../../common/endpoint.js";
import {
	controllerDecorator,
	HTTP_DECORATORS,
	hasDecorator,
	isController,
	resolveDecoratorWrapper,
} from "../nest-class-inspector.js";
import { yieldToEventLoop } from "../yield.js";
import { extractSimpleTypeName, type ProviderInfo } from "./type-resolver.js";

const MAX_TRACE_DEPTH = 10;
const QUOTE_REGEX = /^['"`]|['"`]$/g;
const WHITESPACE_REGEX = /\s/;
const DUPLICATE_SLASH_REGEX = /\/+/g;
const TRAILING_SLASH_REGEX = /\/$/;
const GRAPHQL_DECORATORS = new Set(["Query", "Mutation", "Subscription"]);
const SWAGGER_DECORATORS = new Set([
	"ApiOperation",
	"ApiParam",
	"ApiQuery",
	"ApiResponse",
	"ApiBody",
]);

const ITERATION_CALLBACK_METHODS = new Set([
	"map",
	"forEach",
	"filter",
	"find",
	"some",
	"every",
	"flatMap",
	"reduce",
]);

interface IterationInfo {
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
}

interface ConditionalInfo {
	branchKind: BranchKind | null;
	/** Every enclosing construct, outermost first. Empty when unconditional. */
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	isConditional: boolean;
	statementLine: number | null;
	/** Group of the innermost `try` with a `catch`, matching that catch's arm. */
	tryRegion: string | null;
}

interface OrderedMethodUsage {
	assignedTo: string | null;
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	/** Injected member the call went through, which names one declaration. */
	member: string;
	name: string;
	order: number;
	tryRegion: string | null;
}

interface UsedDependency {
	className: string;
	methodsCalled: OrderedMethodUsage[];
}

interface SameClassCallUsage {
	assignedTo: string | null;
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	childResult: ScanResult;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	methodName: string;
	order: number;
	sortKey: number;
	tryRegion: string | null;
	/** The call was `super.method()`, so it targets the base declaration. */
	viaSuper: boolean;
}

interface ThrowUsage {
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	exceptionClassName: string;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	merged?: boolean;
	message: string | null;
	order: number;
	sortKey: number;
	tryRegion: string | null;
}

interface StepUsage {
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	order: number;
	sortKey: number;
	statements: StepStatement[];
	tryRegion: string | null;
}

/** Where a call outside the injected receivers lands. */
export interface FreeCallTarget {
	/** Class declaring the static method, empty for a free function. */
	className: string;
	filePath: string;
	isStatic: boolean;
	methodName: string;
}

/** A `helper()` or `Klass.helper()` call reaching code this project declares. */
interface FreeCallUsage extends FreeCallTarget {
	assignedTo: string | null;
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	order: number;
	sortKey: number;
	tryRegion: string | null;
}

/** A `return` belonging to the scanned method itself. */
interface ReturnUsage {
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	/** The returned expression, null for a bare `return`. */
	expression: string | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	order: number;
	sortKey: number;
	tryRegion: string | null;
}

/** A `this.<injected>.<member>.<method>()` call site. */
interface MemberCallUsage {
	assignedTo: string | null;
	awaited: boolean;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionPath: ConditionFrame[];
	conditionText: string | null;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	member: string;
	methodName: string;
	order: number;
	paramName: string;
	sortKey: number;
	tryRegion: string | null;
}

export interface ScanOptions {
	/**
	 * Record every `this.` and `super.` call: recursion, and methods a base
	 * class declares. The tree leaves this off, since it expands each call into
	 * a subtree and would not terminate on a cycle.
	 */
	everyThisCall?: boolean;
	/**
	 * Record calls to functions and static methods this project declares, which
	 * belong to no injected receiver.
	 */
	freeCalls?: boolean;
	/**
	 * Keep a throw the guard merge folded into a call, flagged rather than
	 * deleted. The tree drops it so the report does not show it twice.
	 */
	keepMergedThrows?: boolean;
	/** Collect two-level receivers into `memberCalls` instead of dropping them. */
	memberCalls?: boolean;
	/**
	 * Collect the method's own `return` statements into `returns`. They take
	 * order numbers, so the endpoint tree leaves this off.
	 */
	returns?: boolean;
	/** Leave `sameClassCalls[].childResult` empty instead of recursing into it. */
	skipChildScan?: boolean;
}

export interface ScanResult {
	deps: UsedDependency[];
	freeCalls: FreeCallUsage[];
	memberCalls: MemberCallUsage[];
	returns: ReturnUsage[];
	sameClassCalls: SameClassCallUsage[];
	steps: StepUsage[];
	throws: ThrowUsage[];
}

export class ScanCache {
	private readonly scanResults = new Map<string, ScanResult>();
	private readonly injectionMaps = new Map<string, Map<string, string>>();
	private readonly methodLookups = new Map<
		string,
		MethodDeclaration | undefined
	>();

	getScan(key: string) {
		return this.scanResults.get(key);
	}
	setScan(key: string, value: ScanResult) {
		this.scanResults.set(key, value);
	}

	getInjMap(key: string) {
		return this.injectionMaps.get(key);
	}
	setInjMap(key: string, value: Map<string, string>) {
		this.injectionMaps.set(key, value);
	}

	getMethod(key: string) {
		return this.methodLookups.has(key)
			? this.methodLookups.get(key)
			: undefined;
	}
	hasMethod(key: string) {
		return this.methodLookups.has(key);
	}
	setMethod(key: string, value: MethodDeclaration | undefined) {
		this.methodLookups.set(key, value);
	}
}

const EXIT_OWNER_KINDS = new Set([
	SyntaxKind.ArrowFunction,
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.FunctionExpression,
	SyntaxKind.MethodDeclaration,
]);

/** True when the statement leaves `method` itself, not a function nested in it. */
function ownsExit(statement: Node, method: Node): boolean {
	return (
		statement.getFirstAncestor((ancestor) =>
			EXIT_OWNER_KINDS.has(ancestor.getKind())
		) === method
	);
}

const MAX_CONDITION_TEXT_LENGTH = 50;

function normalizeSnippet(text: string): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length > MAX_CONDITION_TEXT_LENGTH) {
		return `${collapsed.slice(0, MAX_CONDITION_TEXT_LENGTH)}\u2026`;
	}
	return collapsed;
}

/** The `if` a chain opens with. Every arm of one chain reports this one. */
function chainRoot(ifStmt: IfStatement): IfStatement {
	let root = ifStmt;
	let above = root.getParent()?.asKind(SyntaxKind.IfStatement);
	while (above?.getElseStatement() === root) {
		root = above;
		above = root.getParent()?.asKind(SyntaxKind.IfStatement);
	}
	return root;
}

/** The construct `current` sits directly inside, if `parent` opens one. */
function frameFor(current: Node, parent: Node): ConditionFrame | undefined {
	const ifStmt = parent.asKind(SyntaxKind.IfStatement);
	if (ifStmt) {
		const conditionText = normalizeSnippet(ifStmt.getExpression().getText());
		const root = chainRoot(ifStmt);
		const chained = root !== ifStmt;
		if (current === ifStmt.getThenStatement()) {
			return {
				branchKind: chained ? "else-if" : "if",
				conditionText,
				statementLine: root.getStartLineNumber(),
			};
		}
		if (current === ifStmt.getElseStatement()) {
			// A chained `else if` already produced its own frame.
			return current.isKind(SyntaxKind.IfStatement)
				? undefined
				: {
						branchKind: "else",
						// The tail of a chain fails every test above it, so no one
						// condition describes it.
						conditionText: chained ? null : conditionText,
						statementLine: root.getStartLineNumber(),
					};
		}
	}

	const condExpr = parent.asKind(SyntaxKind.ConditionalExpression);
	if (condExpr) {
		const conditionText = normalizeSnippet(condExpr.getCondition().getText());
		const statementLine = condExpr.getStartLineNumber();
		if (current === condExpr.getWhenTrue()) {
			return { branchKind: "ternary-true", conditionText, statementLine };
		}
		if (current === condExpr.getWhenFalse()) {
			return { branchKind: "ternary-false", conditionText, statementLine };
		}
	}

	const caseClause = current.asKind(SyntaxKind.CaseClause);
	if (caseClause) {
		return {
			branchKind: "case",
			conditionText: normalizeSnippet(caseClause.getExpression().getText()),
			statementLine: current
				.getParentOrThrow()
				.getParentOrThrow()
				.getStartLineNumber(),
		};
	}
	if (current.isKind(SyntaxKind.DefaultClause)) {
		return {
			branchKind: "default",
			conditionText: null,
			statementLine: current
				.getParentOrThrow()
				.getParentOrThrow()
				.getStartLineNumber(),
		};
	}
	if (current.isKind(SyntaxKind.CatchClause)) {
		return {
			branchKind: "catch",
			conditionText: null,
			statementLine: current.getParentOrThrow().getStartLineNumber(),
		};
	}
	return undefined;
}

/**
 * The group of the `try` whose block holds `current`, when a `catch` covers it.
 * A `try`/`finally` has no handler, so it yields nothing.
 */
function guardedRegion(current: Node, parent: Node): string | null {
	const tryStmt = parent.asKind(SyntaxKind.TryStatement);
	if (
		!tryStmt ||
		current !== tryStmt.getTryBlock() ||
		!tryStmt.getCatchClause()
	) {
		return null;
	}
	return `L${tryStmt.getStartLineNumber()}`;
}

/**
 * Every construct enclosing `node` up to `boundary`, outermost first, with the
 * innermost one repeated in the flat fields.
 */
function getConditionalInfo(node: Node, boundary: Node): ConditionalInfo {
	const frames: ConditionFrame[] = [];
	let tryRegion: string | null = null;
	let current: Node | undefined = node;
	while (current && current !== boundary) {
		const parent = current.getParent();
		if (!parent || parent === boundary) {
			break;
		}
		const frame = frameFor(current, parent);
		if (frame) {
			frames.push(frame);
		}
		tryRegion ??= guardedRegion(current, parent);
		current = parent;
	}
	const innermost = frames[0];
	frames.reverse();
	return {
		branchKind: innermost?.branchKind ?? null,
		conditionPath: frames,
		conditionText: innermost?.conditionText ?? null,
		isConditional: frames.length > 0,
		statementLine: innermost?.statementLine ?? null,
		tryRegion,
	};
}

const LOOP_LABEL_MAP = new Map<SyntaxKind, string>([
	[SyntaxKind.ForStatement, "for"],
	[SyntaxKind.ForOfStatement, "for-of"],
	[SyntaxKind.ForInStatement, "for-in"],
	[SyntaxKind.WhileStatement, "while"],
	[SyntaxKind.DoStatement, "do-while"],
]);

function getIterationContext(node: Node, boundary: Node): IterationInfo {
	const none: IterationInfo = { iterationKind: null, iterationLabel: null };

	let current: Node | undefined = node;
	while (current && current !== boundary) {
		const parent = current.getParent();
		if (!parent || parent === boundary) {
			break;
		}
		const parentKind = parent.getKind();

		// A. Loop statements
		const loopLabel = LOOP_LABEL_MAP.get(parentKind);
		if (loopLabel) {
			// Verify current is the body, not the initializer/condition/expression
			let isBody = false;
			if (parentKind === SyntaxKind.ForStatement) {
				const forStmt = parent.asKindOrThrow(SyntaxKind.ForStatement);
				isBody =
					current !== forStmt.getInitializer() &&
					current !== forStmt.getCondition() &&
					current !== forStmt.getIncrementor() &&
					current === forStmt.getStatement();
			} else if (parentKind === SyntaxKind.ForOfStatement) {
				isBody =
					current ===
					parent.asKindOrThrow(SyntaxKind.ForOfStatement).getStatement();
			} else if (parentKind === SyntaxKind.ForInStatement) {
				isBody =
					current ===
					parent.asKindOrThrow(SyntaxKind.ForInStatement).getStatement();
			} else if (parentKind === SyntaxKind.WhileStatement) {
				isBody =
					current ===
					parent.asKindOrThrow(SyntaxKind.WhileStatement).getStatement();
			} else if (parentKind === SyntaxKind.DoStatement) {
				isBody =
					current ===
					parent.asKindOrThrow(SyntaxKind.DoStatement).getStatement();
			}
			if (isBody) {
				const awaiting =
					parentKind === SyntaxKind.ForOfStatement &&
					parent.asKindOrThrow(SyntaxKind.ForOfStatement).getAwaitKeyword() !==
						undefined;
				return {
					iterationKind: "loop",
					iterationLabel: awaiting ? "for-await-of" : loopLabel,
				};
			}
		}

		// B. Callback to iteration method
		const currentKind = current.getKind();
		if (
			currentKind === SyntaxKind.ArrowFunction ||
			currentKind === SyntaxKind.FunctionExpression
		) {
			if (parentKind === SyntaxKind.CallExpression) {
				const callExpr = parent.asKindOrThrow(SyntaxKind.CallExpression);
				const args = callExpr.getArguments();
				const isArg = args.some((a) => a === current);
				if (isArg) {
					const calleeExpr = callExpr.getExpression();
					if (calleeExpr.getKind() === SyntaxKind.PropertyAccessExpression) {
						const propAccess = calleeExpr.asKindOrThrow(
							SyntaxKind.PropertyAccessExpression
						);
						const methodName = propAccess.getName();
						if (ITERATION_CALLBACK_METHODS.has(methodName)) {
							return {
								iterationKind: "callback",
								iterationLabel: methodName,
							};
						}
					}
				}
			}

			// D. Stop at function boundaries that are NOT iteration callbacks
			break;
		}

		// C. Promise.all
		if (parentKind === SyntaxKind.ArrayLiteralExpression) {
			const grandparent = parent.getParent();
			if (grandparent && grandparent.getKind() === SyntaxKind.CallExpression) {
				const gpCall: CallExpression = grandparent.asKindOrThrow(
					SyntaxKind.CallExpression
				);
				const gpArgs = gpCall.getArguments();
				if (gpArgs.length > 0 && gpArgs[0] === parent) {
					const gpExpr = gpCall.getExpression();
					if (gpExpr.getKind() === SyntaxKind.PropertyAccessExpression) {
						const gpProp = gpExpr.asKindOrThrow(
							SyntaxKind.PropertyAccessExpression
						);
						if (
							gpProp.getName() === "all" &&
							gpProp.getExpression().getText().endsWith("Promise")
						) {
							return {
								iterationKind: "concurrent",
								iterationLabel: "all",
							};
						}
					}
				}
			}
		}

		current = parent;
	}
	return none;
}

function extractLeadingComment(node: Node): string | null {
	let current: Node | undefined = node;
	while (current) {
		const kind = current.getKind();
		if (
			kind === SyntaxKind.ExpressionStatement ||
			kind === SyntaxKind.VariableStatement ||
			kind === SyntaxKind.ReturnStatement ||
			kind === SyntaxKind.ThrowStatement
		) {
			break;
		}
		current = current.getParent();
	}
	if (!current) {
		return null;
	}

	const sourceFile = current.getSourceFile();
	const fullStart = current.getFullStart();
	const start = current.getStart();
	const triviaText = sourceFile.getFullText().slice(fullStart, start);

	const lines = triviaText.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const trimmed = lines[i].trim();
		if (trimmed.startsWith("//")) {
			return trimmed.slice(2).trim();
		}
		if (trimmed.length > 0) {
			break;
		}
	}
	return null;
}

function extractThrowClassName(throwStmt: Node): string {
	const expr = throwStmt
		.asKindOrThrow(SyntaxKind.ThrowStatement)
		.getExpression();
	if (expr && expr.getKind() === SyntaxKind.NewExpression) {
		const newExpr = expr.asKindOrThrow(SyntaxKind.NewExpression);
		return extractSimpleTypeName(newExpr.getExpression().getText());
	}
	return "Error";
}

const MAX_THROW_MESSAGE_LENGTH = 80;

function extractThrowMessage(throwStmt: Node): string | null {
	const expr = throwStmt
		.asKindOrThrow(SyntaxKind.ThrowStatement)
		.getExpression();
	if (!expr || expr.getKind() !== SyntaxKind.NewExpression) {
		return null;
	}
	const newExpr = expr.asKindOrThrow(SyntaxKind.NewExpression);
	const args = newExpr.getArguments();
	if (args.length === 0) {
		return null;
	}
	const firstArg = args[0];
	const kind = firstArg.getKind();
	let raw: string;
	if (
		kind === SyntaxKind.StringLiteral ||
		kind === SyntaxKind.NoSubstitutionTemplateLiteral
	) {
		raw = firstArg.asKindOrThrow(kind).getLiteralValue() as string;
	} else if (kind === SyntaxKind.TemplateExpression) {
		const text = firstArg.getText();
		raw = text.startsWith("`") ? text.slice(1, -1) : text;
	} else {
		raw = firstArg.getText();
	}
	if (raw.length > MAX_THROW_MESSAGE_LENGTH) {
		return `${raw.slice(0, MAX_THROW_MESSAGE_LENGTH)}\u2026`;
	}
	return raw;
}

// Wrappers that do not change whether the call site is awaited.
const TRANSPARENT_KINDS = new Set([
	SyntaxKind.AsExpression,
	SyntaxKind.NonNullExpression,
	SyntaxKind.ParenthesizedExpression,
]);

/**
 * True when this call site is itself awaited. A call handed to `Promise.all`
 * reads as false; its iteration kind is what says the promise is collected.
 */
function isAwaitedCall(callNode: Node): boolean {
	let current = callNode.getParent();
	while (current && TRANSPARENT_KINDS.has(current.getKind())) {
		current = current.getParent();
	}
	return current?.isKind(SyntaxKind.AwaitExpression) === true;
}

function extractAssignedVariable(callNode: Node): string | null {
	let current = callNode.getParent();
	while (current) {
		const kind = current.getKind();
		if (
			kind === SyntaxKind.AwaitExpression ||
			kind === SyntaxKind.ParenthesizedExpression ||
			kind === SyntaxKind.AsExpression ||
			kind === SyntaxKind.NonNullExpression
		) {
			current = current.getParent();
			continue;
		}
		if (kind === SyntaxKind.VariableDeclaration) {
			const nameNode = current
				.asKindOrThrow(SyntaxKind.VariableDeclaration)
				.getNameNode();
			if (nameNode.getKind() === SyntaxKind.Identifier) {
				return nameNode.getText();
			}
			return null;
		}
		return null;
	}
	return null;
}

function resolveBaseClass(
	cls: ClassDeclaration,
	providers?: Map<string, ProviderInfo>
): ClassDeclaration | undefined {
	let nextClass: ClassDeclaration | undefined;
	try {
		nextClass = cls.getBaseClass();
	} catch {
		/* base class not resolvable via type system */
	}

	if (!nextClass && providers) {
		const extendsExpr = cls.getExtends();
		if (extendsExpr) {
			const baseClassName = extractSimpleTypeName(
				extendsExpr.getExpression().getText()
			);
			const baseProvider = providers.get(baseClassName);
			if (baseProvider) {
				nextClass = baseProvider.classDeclaration;
			}
		}
	}

	return nextClass;
}

const INSTALLED_PATH = /[\\/]node_modules[\\/]/;

/** The fields every call site records, whatever pattern matched it. */
function callSiteFacts(call: CallExpression, body: Node, order: number) {
	const condInfo = getConditionalInfo(call, body);
	const iterInfo = getIterationContext(call, body);
	return {
		assignedTo: extractAssignedVariable(call),
		awaited: isAwaitedCall(call),
		branchGroupId: condInfo.statementLine ? `L${condInfo.statementLine}` : null,
		branchKind: condInfo.branchKind,
		callSiteLine: call.getStartLineNumber(),
		comment: extractLeadingComment(call),
		conditional: condInfo.isConditional,
		conditionPath: condInfo.conditionPath,
		conditionText: condInfo.conditionText,
		iterationKind: iterInfo.iterationKind,
		iterationLabel: iterInfo.iterationLabel,
		guardThrow: null,
		order,
		sortKey: call.getEnd(),
		tryRegion: condInfo.tryRegion,
	};
}

/** Declarations a name resolves to, following import aliases. */
function declarationsOf(name: Node): Node[] {
	const symbol = name.getSymbol();
	return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

/** True for a declaration this project owns rather than an installed package. */
function ownDeclaration(declaration: Node): boolean {
	return !INSTALLED_PATH.test(declaration.getSourceFile().getFilePath());
}

/**
 * True when the declaration sits at the top of its file. A nested one cannot be
 * reached by name from outside, so the graph has no node to point at.
 */
function topLevel(declaration: Node): boolean {
	return declaration.getParent()?.isKind(SyntaxKind.SourceFile) === true;
}

/** The project function a bare `helper()` reaches, or nothing. */
function freeFunctionTarget(callee: Node): FreeCallTarget | undefined {
	for (const declaration of declarationsOf(callee)) {
		const fn = declaration.asKind(SyntaxKind.FunctionDeclaration);
		const name = fn?.getName();
		if (fn && name && ownDeclaration(fn) && topLevel(fn)) {
			return {
				className: "",
				filePath: fn.getSourceFile().getFilePath(),
				isStatic: false,
				methodName: name,
			};
		}
	}
	return undefined;
}

/** The project static method a `Klass.helper()` reaches, or nothing. */
function staticMethodTarget(
	receiver: Node,
	methodName: string
): FreeCallTarget | undefined {
	for (const declaration of declarationsOf(receiver)) {
		const cls = declaration.asKind(SyntaxKind.ClassDeclaration);
		const name = cls?.getName();
		if (
			cls &&
			name &&
			ownDeclaration(cls) &&
			topLevel(cls) &&
			cls.getStaticMethod(methodName)
		) {
			return {
				className: name,
				filePath: cls.getSourceFile().getFilePath(),
				isStatic: true,
				methodName,
			};
		}
	}
	return undefined;
}

/** The class this one extends, ignoring providers. */
function declaredBaseClass(
	cls: ClassDeclaration
): ClassDeclaration | undefined {
	try {
		return cls.getBaseClass();
	} catch {
		return undefined;
	}
}

/** The nearest declaration of `methodName` at or above `cls`. */
function declaredMethodInHierarchy(
	cls: ClassDeclaration,
	methodName: string
): MethodDeclaration | undefined {
	let current: ClassDeclaration | undefined = cls;
	const seen = new Set<ClassDeclaration>();
	while (current && !seen.has(current)) {
		seen.add(current);
		const method = current.getInstanceMethod(methodName);
		if (method) {
			return method;
		}
		current = declaredBaseClass(current);
	}
	return undefined;
}

export function findMethodInHierarchy(
	cls: ClassDeclaration,
	methodName: string,
	providers: Map<string, ProviderInfo>,
	cache?: ScanCache
): MethodDeclaration | undefined {
	const className = cls.getName() ?? "";
	const cacheKey = `${className}.${methodName}`;
	if (cache?.hasMethod(cacheKey)) {
		return cache.getMethod(cacheKey);
	}

	let current: ClassDeclaration | undefined = cls;
	// Keyed by declaration, since a subclass may carry its base class's name.
	const visited = new Set<ClassDeclaration>();

	while (current && !visited.has(current)) {
		visited.add(current);

		const method = current.getInstanceMethod(methodName);
		if (method) {
			cache?.setMethod(cacheKey, method);
			return method;
		}

		current = resolveBaseClass(current, providers);
	}

	cache?.setMethod(cacheKey, undefined);
	return undefined;
}

function extractControllerPath(cls: ClassDeclaration): string {
	const decorator = controllerDecorator(cls);
	if (!decorator) {
		return "";
	}

	const args = decorator.getArguments();
	if (args.length === 0) {
		return "";
	}

	const firstArg = args[0];

	if (firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
		const obj = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
		const pathProp = obj.getProperty("path");
		if (!pathProp) {
			return "";
		}
		const assignment = pathProp.asKind(SyntaxKind.PropertyAssignment);
		if (!assignment) {
			return "";
		}
		const init = assignment.getInitializer();
		return init ? init.getText().replace(QUOTE_REGEX, "") : "";
	}

	return firstArg.getText().replace(QUOTE_REGEX, "");
}

function extractRouteInfo(
	method: MethodDeclaration
): { httpMethod: string; path: string } | undefined {
	for (const decorator of method.getDecorators()) {
		const name = decorator.getName();
		if (!HTTP_DECORATORS.has(name)) {
			continue;
		}

		const args = decorator.getArguments();
		const path =
			args.length > 0 ? args[0].getText().replace(QUOTE_REGEX, "") : "";

		return { httpMethod: name.toUpperCase(), path };
	}

	// Wrapper decorators that compose an HTTP method internally.
	for (const decorator of method.getDecorators()) {
		const targets = resolveDecoratorWrapper(decorator);
		if (targets.httpMethod === null) {
			continue;
		}
		return {
			httpMethod: targets.httpMethod,
			path: wrapperRoutePath(decorator, targets.pathParamIndex),
		};
	}
	return undefined;
}

/**
 * The wrapper argument reaching the composed HTTP call's path slot; when the
 * slot is undetermined, the first whitespace-free string argument.
 */
function wrapperRoutePath(
	decorator: Decorator,
	pathParamIndex: number | null
): string {
	if (pathParamIndex === -1) {
		return "";
	}
	if (pathParamIndex !== null) {
		const arg = decorator.getArguments()[pathParamIndex];
		return arg?.getKind() === SyntaxKind.StringLiteral
			? arg.getText().replace(QUOTE_REGEX, "")
			: "";
	}
	const stringArg = decorator.getArguments().find((a: Node) => {
		if (a.getKind() !== SyntaxKind.StringLiteral) {
			return false;
		}
		return !WHITESPACE_REGEX.test(a.getText().replace(QUOTE_REGEX, ""));
	});
	return stringArg ? stringArg.getText().replace(QUOTE_REGEX, "") : "";
}

function composePath(controllerPath: string, methodPath: string): string {
	const parts = [controllerPath, methodPath].filter(Boolean);
	const joined = parts.join("/");
	const normalized = `/${joined}`
		.replace(DUPLICATE_SLASH_REGEX, "/")
		.replace(TRAILING_SLASH_REGEX, "");
	return normalized || "/";
}

function getObjectLiteralStringProp(
	obj: Node,
	propName: string
): string | null {
	const objLit = obj.asKind(SyntaxKind.ObjectLiteralExpression);
	if (!objLit) {
		return null;
	}
	const prop = objLit.getProperty(propName);
	if (!prop) {
		return null;
	}
	const assignment = prop.asKind(SyntaxKind.PropertyAssignment);
	if (!assignment) {
		return null;
	}
	const init = assignment.getInitializer();
	if (!init) {
		return null;
	}
	return init.getText().replace(QUOTE_REGEX, "");
}

function getObjectLiteralNumberProp(
	obj: Node,
	propName: string
): number | null {
	const str = getObjectLiteralStringProp(obj, propName);
	if (str === null) {
		return null;
	}
	const num = Number(str);
	return Number.isNaN(num) ? null : num;
}

function getObjectLiteralBoolProp(
	obj: Node,
	propName: string,
	defaultValue: boolean
): boolean {
	const str = getObjectLiteralStringProp(obj, propName);
	if (str === null) {
		return defaultValue;
	}
	return str === "true";
}

function extractSwaggerMetadata(
	method: MethodDeclaration
): SwaggerMetadata | null {
	let summary: string | null = null;
	let description: string | null = null;
	const params: ApiParamInfo[] = [];
	const queryParams: ApiParamInfo[] = [];
	const responses: ApiResponseInfo[] = [];
	let body: ApiBodyInfo | null = null;
	let found = false;

	for (const decorator of method.getDecorators()) {
		const name = decorator.getName();
		if (!SWAGGER_DECORATORS.has(name)) {
			continue;
		}
		found = true;

		const args = decorator.getArguments();
		if (args.length === 0) {
			continue;
		}
		const firstArg = args[0];

		if (name === "ApiOperation") {
			summary = getObjectLiteralStringProp(firstArg, "summary");
			description = getObjectLiteralStringProp(firstArg, "description");
		} else if (name === "ApiParam") {
			const paramName = getObjectLiteralStringProp(firstArg, "name");
			if (paramName) {
				params.push({
					description: getObjectLiteralStringProp(firstArg, "description"),
					name: paramName,
					required: getObjectLiteralBoolProp(firstArg, "required", true),
					type: getObjectLiteralStringProp(firstArg, "type"),
				});
			}
		} else if (name === "ApiQuery") {
			const paramName = getObjectLiteralStringProp(firstArg, "name");
			if (paramName) {
				queryParams.push({
					description: getObjectLiteralStringProp(firstArg, "description"),
					name: paramName,
					required: getObjectLiteralBoolProp(firstArg, "required", false),
					type: getObjectLiteralStringProp(firstArg, "type"),
				});
			}
		} else if (name === "ApiResponse") {
			const status = getObjectLiteralNumberProp(firstArg, "status") ?? 200;
			let type = getObjectLiteralStringProp(firstArg, "type");
			// Handle array syntax: [ClassName] → ClassName[]
			if (type?.startsWith("[") && type.endsWith("]")) {
				type = `${type.slice(1, -1)}[]`;
			}
			responses.push({
				description: getObjectLiteralStringProp(firstArg, "description"),
				status,
				type,
			});
		} else if (name === "ApiBody") {
			body = {
				description: getObjectLiteralStringProp(firstArg, "description"),
				type: getObjectLiteralStringProp(firstArg, "type"),
			};
		}
	}

	// Fallback: infer body from @Body() parameter decorator type annotation
	if (!body) {
		for (const param of method.getParameters()) {
			const hasBodyDec = param
				.getDecorators()
				.some((d) => d.getName() === "Body");
			if (hasBodyDec) {
				const typeNode = param.getTypeNode();
				if (typeNode) {
					body = { description: null, type: typeNode.getText() };
					found = true;
				}
				break;
			}
		}
	}

	if (!found) {
		return null;
	}
	return { body, description, params, queryParams, responses, summary };
}

const PROMISE_OBSERVABLE_REGEX = /^(?:Promise|Observable)<(.+)>$/;

export function extractReturnType(
	method: FunctionDeclaration | MethodDeclaration
): string | null {
	const typeNode = method.getReturnTypeNode();
	if (!typeNode) {
		return null;
	}
	let text = typeNode.getText().trim();
	// Unwrap Promise<T> and Observable<T>
	const match = PROMISE_OBSERVABLE_REGEX.exec(text);
	if (match) {
		text = match[1];
	}
	if (text === "void" || text === "any" || text === "unknown") {
		return null;
	}
	return text;
}

export function extractMethodParameters(
	method: FunctionDeclaration | MethodDeclaration
): MethodParameterInfo[] {
	return method
		.getParameters()
		.filter((p) => p.getName() !== "this")
		.map((p) => ({
			name: p.getName(),
			type: p.getTypeNode()?.getText() ?? null,
		}));
}

const CONDENSED_ARROW_BODY_REGEX = /[=]>\s*\{[^}]*\}/g;
const CONDENSED_CALLBACK_REGEX = /\(([^)]{20,})\)\s*=>/g;
const CONDENSED_WHITESPACE_REGEX = /\s+/g;

function condensedText(raw: string): string {
	let text = raw.replace(CONDENSED_WHITESPACE_REGEX, " ").trim();
	text = text.replace(CONDENSED_ARROW_BODY_REGEX, "=> …");
	text = text.replace(CONDENSED_CALLBACK_REGEX, "(…) =>");
	if (text.length > 50) {
		text = `${text.slice(0, 47)}…`;
	}
	return text;
}

function isInterestingStatement(
	stmt: Node,
	trackedPositions: Set<number>
): boolean {
	const kind = stmt.getKind();
	if (
		kind !== SyntaxKind.VariableStatement &&
		kind !== SyntaxKind.ExpressionStatement
	) {
		return false;
	}

	const calls = [
		...stmt.getDescendantsOfKind(SyntaxKind.CallExpression),
		...stmt.getDescendantsOfKind(SyntaxKind.NewExpression),
	];
	if (calls.length === 0) {
		return false;
	}

	// Check if ANY call overlaps with tracked positions
	for (const c of calls) {
		if (trackedPositions.has(c.getStart())) {
			return false;
		}
	}

	// Skip console.* and this.logger.* calls
	for (const c of calls) {
		const text = c.getText();
		if (text.startsWith("console.") || text.startsWith("this.logger.")) {
			return false;
		}
	}

	return true;
}

function extractStatementInfo(
	stmt: Node
): { assignedTo: string | null; text: string } | null {
	if (stmt.getKind() === SyntaxKind.VariableStatement) {
		const decls = stmt
			.asKindOrThrow(SyntaxKind.VariableStatement)
			.getDeclarationList()
			.getDeclarations();
		if (decls.length === 0) {
			return null;
		}
		const first = decls[0];
		const nameNode = first.getNameNode();
		const name = nameNode.getText();
		const init = first.getInitializer();
		if (!init) {
			return null;
		}
		const text = `${name} = ${condensedText(init.getText())}`;
		return { assignedTo: name, text };
	}
	if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
		const expr = stmt
			.asKindOrThrow(SyntaxKind.ExpressionStatement)
			.getExpression();
		return { assignedTo: null, text: condensedText(expr.getText()) };
	}
	return null;
}

export function buildInjectionMap(
	cls: ClassDeclaration,
	providers?: Map<string, ProviderInfo>,
	cache?: ScanCache
): Map<string, string> {
	const className = cls.getName() ?? "";
	if (cache) {
		const cached = cache.getInjMap(className);
		if (cached) {
			return cached;
		}
	}

	const map = new Map<string, string>();

	// 1. Find constructor params — walk up the class hierarchy if needed
	let ctorClass: ClassDeclaration | undefined = cls;
	const visited = new Set<string>();

	while (ctorClass) {
		const className = ctorClass.getName();
		if (className && visited.has(className)) {
			break;
		}
		if (className) {
			visited.add(className);
		}

		const ctor = ctorClass.getConstructors()[0];
		if (ctor) {
			for (const param of ctor.getParameters()) {
				const name = param.getName();
				if (!map.has(name)) {
					const typeNode = param.getTypeNode();
					const typeText = typeNode
						? typeNode.getText()
						: param.getType().getText();
					map.set(name, extractSimpleTypeName(typeText));
				}
			}
			break; // Found a constructor, stop walking
		}

		ctorClass = resolveBaseClass(ctorClass, providers);
	}

	// 2. Scan property declarations with @Inject() decorator
	for (const prop of cls.getProperties()) {
		if (prop.getDecorator("Inject")) {
			const name = prop.getName();
			if (!map.has(name)) {
				const typeNode = prop.getTypeNode();
				if (typeNode) {
					map.set(name, extractSimpleTypeName(typeNode.getText()));
				}
			}
		}
	}

	if (cache) {
		cache.setInjMap(className, map);
	}
	return map;
}

function mergeGuardThrows(
	callEntries: Array<{
		assignedTo: string | null;
		order: number;
		guardThrow: GuardThrow | null;
	}>,
	throws: ThrowUsage[],
	keepMerged?: boolean
): void {
	for (const entry of callEntries) {
		if (!entry.assignedTo) {
			continue;
		}
		const varPattern = new RegExp(`\\b${entry.assignedTo}\\b`);
		for (const t of throws) {
			if (t.merged) {
				continue;
			}
			if (t.order <= entry.order) {
				continue;
			}
			if (!(t.conditional && t.conditionText)) {
				continue;
			}
			if (varPattern.test(t.conditionText)) {
				entry.guardThrow = {
					branchKind: t.branchKind,
					callSiteLine: t.callSiteLine,
					className: t.exceptionClassName,
					conditionText: t.conditionText,
					message: t.message,
				};
				t.merged = true;
				break;
			}
		}
	}
	if (keepMerged) {
		return;
	}
	// Remove merged throws in-place
	const kept = throws.filter((t) => !t.merged);
	throws.length = 0;
	for (const t of kept) {
		throws.push(t);
	}
}

export function scanUsedDependencies(
	method: MethodDeclaration,
	injectionMap: Map<string, string>,
	cls?: ClassDeclaration,
	visitedMethods?: Set<string>,
	cache?: ScanCache,
	options?: ScanOptions
): ScanResult {
	const className = cls?.getName() ?? "";
	const cacheKey = `${className}::${method.getName()}`;
	if (!visitedMethods && cache) {
		const cached = cache.getScan(cacheKey);
		if (cached) {
			return cached;
		}
	}

	const empty: ScanResult = {
		deps: [],
		freeCalls: [],
		memberCalls: [],
		returns: [],
		sameClassCalls: [],
		steps: [],
		throws: [],
	};
	const body = method.getBody();
	if (!body) {
		return empty;
	}

	// Track visited methods to prevent infinite recursion for this.method() calls
	const visited = visitedMethods ?? new Set<string>();
	const currentMethodName = method.getName();
	if (visited.has(currentMethodName)) {
		return empty;
	}
	visited.add(currentMethodName);

	// Pre-scan for aliases: const svc = this.paramName
	const aliases = new Map<string, string>();
	for (const varDecl of body.getDescendantsOfKind(
		SyntaxKind.VariableDeclaration
	)) {
		const init = varDecl.getInitializer();
		if (init && init.getKind() === SyntaxKind.PropertyAccessExpression) {
			const pa = init.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
			if (pa.getExpression().getKind() === SyntaxKind.ThisKeyword) {
				const pName = pa.getName();
				if (injectionMap.has(pName)) {
					aliases.set(varDecl.getName(), pName);
				}
			}
		}
	}

	const sameClassCalls: SameClassCallUsage[] = [];
	const freeCalls: FreeCallUsage[] = [];
	const memberCalls: MemberCallUsage[] = [];
	const returns: ReturnUsage[] = [];
	const throws: ThrowUsage[] = [];

	// Flat array: each dependency call gets its own entry (no dedup by method name)
	const callEntries: Array<{
		assignedTo: string | null;
		awaited: boolean;
		sortKey: number;
		paramName: string;
		methodName: string;
		order: number;
		callSiteLine: number;
		comment: string | null;
		condInfo: ConditionalInfo;
		iterInfo: IterationInfo;
		guardThrow: GuardThrow | null;
	}> = [];
	let callOrder = 0;
	const callExpressions = body.getDescendantsOfKind(SyntaxKind.CallExpression);
	const throwStatements = body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
	const returnStatements = options?.returns
		? body
				.getDescendantsOfKind(SyntaxKind.ReturnStatement)
				.filter((statement) => ownsExit(statement, method))
		: [];

	type WorkItem =
		| { kind: "call"; node: (typeof callExpressions)[number] }
		| { kind: "return"; node: (typeof returnStatements)[number] }
		| { kind: "throw"; node: (typeof throwStatements)[number] };

	const workItems: WorkItem[] = [
		...callExpressions.map((node) => ({ kind: "call" as const, node })),
		...returnStatements.map((node) => ({ kind: "return" as const, node })),
		...throwStatements.map((node) => ({ kind: "throw" as const, node })),
	];
	workItems.sort((a, b) => a.node.getEnd() - b.node.getEnd());

	for (const item of workItems) {
		if (item.kind === "return") {
			const condInfo = getConditionalInfo(item.node, body);
			const iterInfo = getIterationContext(item.node, body);
			const expression = item.node.getExpression();
			returns.push({
				branchGroupId: condInfo.statementLine
					? `L${condInfo.statementLine}`
					: null,
				branchKind: condInfo.branchKind,
				callSiteLine: item.node.getStartLineNumber(),
				comment: extractLeadingComment(item.node),
				conditional: condInfo.isConditional,
				conditionPath: condInfo.conditionPath,
				tryRegion: condInfo.tryRegion,
				conditionText: condInfo.conditionText,
				expression: expression ? normalizeSnippet(expression.getText()) : null,
				sortKey: item.node.getEnd(),
				iterationKind: iterInfo.iterationKind,
				iterationLabel: iterInfo.iterationLabel,
				order: callOrder++,
			});
			continue;
		}
		if (item.kind === "throw") {
			const condInfo = getConditionalInfo(item.node, body);
			const iterInfo = getIterationContext(item.node, body);
			throws.push({
				branchGroupId: condInfo.statementLine
					? `L${condInfo.statementLine}`
					: null,
				branchKind: condInfo.branchKind,
				callSiteLine: item.node.getStartLineNumber(),
				comment: extractLeadingComment(item.node),
				conditional: condInfo.isConditional,
				conditionPath: condInfo.conditionPath,
				tryRegion: condInfo.tryRegion,
				conditionText: condInfo.conditionText,
				exceptionClassName: extractThrowClassName(item.node),
				sortKey: item.node.getEnd(),
				iterationKind: iterInfo.iterationKind,
				iterationLabel: iterInfo.iterationLabel,
				message: extractThrowMessage(item.node),
				order: callOrder++,
			});
			continue;
		}

		const call = item.node;
		const expr = call.getExpression();
		if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) {
			// Pattern D: helper(), declared by this project
			const target =
				options?.freeCalls && expr.isKind(SyntaxKind.Identifier)
					? freeFunctionTarget(expr)
					: undefined;
			if (target) {
				freeCalls.push({
					...target,
					...callSiteFacts(call, body, callOrder++),
				});
			}
			continue;
		}

		const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		const calledMethodName = propAccess.getName();
		const receiver = propAccess.getExpression();

		let paramName: string | undefined;

		// Pattern A: this.param.method()
		if (receiver.getKind() === SyntaxKind.PropertyAccessExpression) {
			const innerAccess = receiver.asKindOrThrow(
				SyntaxKind.PropertyAccessExpression
			);
			if (innerAccess.getExpression().getKind() === SyntaxKind.ThisKeyword) {
				const name = innerAccess.getName();
				if (injectionMap.has(name)) {
					paramName = name;
				}
			}
		}

		// Pattern A2: this.param.member.method()
		if (
			!paramName &&
			options?.memberCalls &&
			receiver.getKind() === SyntaxKind.PropertyAccessExpression
		) {
			const memberAccess = receiver.asKindOrThrow(
				SyntaxKind.PropertyAccessExpression
			);
			const root = memberAccess.getExpression();
			const rootName =
				root.getKind() === SyntaxKind.PropertyAccessExpression &&
				root
					.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
					.getExpression()
					.getKind() === SyntaxKind.ThisKeyword
					? root.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName()
					: undefined;
			if (rootName && injectionMap.has(rootName)) {
				const condInfo = getConditionalInfo(call, body);
				const iterInfo = getIterationContext(call, body);
				memberCalls.push({
					assignedTo: extractAssignedVariable(call),
					awaited: isAwaitedCall(call),
					sortKey: call.getEnd(),
					branchGroupId: condInfo.statementLine
						? `L${condInfo.statementLine}`
						: null,
					branchKind: condInfo.branchKind,
					callSiteLine: call.getStartLineNumber(),
					comment: extractLeadingComment(call),
					conditional: condInfo.isConditional,
					conditionPath: condInfo.conditionPath,
					tryRegion: condInfo.tryRegion,
					conditionText: condInfo.conditionText,
					guardThrow: null,
					iterationKind: iterInfo.iterationKind,
					iterationLabel: iterInfo.iterationLabel,
					member: memberAccess.getName(),
					methodName: calledMethodName,
					order: callOrder++,
					paramName: rootName,
				});
				continue;
			}
		}

		// Pattern B: alias.method() where alias = this.param
		if (!paramName && receiver.getKind() === SyntaxKind.Identifier) {
			const aliasName = receiver.getText();
			const resolved = aliases.get(aliasName);
			if (resolved) {
				paramName = resolved;
			}
		}

		// Track the dependency call
		if (paramName) {
			const condInfo = getConditionalInfo(call, body);
			const iterInfo = getIterationContext(call, body);
			callEntries.push({
				assignedTo: extractAssignedVariable(call),
				awaited: isAwaitedCall(call),
				sortKey: call.getEnd(),
				paramName,
				methodName: calledMethodName,
				order: callOrder++,
				callSiteLine: call.getStartLineNumber(),
				comment: extractLeadingComment(call),
				condInfo,
				iterInfo,
				guardThrow: null,
			});
			continue;
		}

		// Pattern C: this.method() or super.method() — same-class helper call
		const viaSuper = receiver.getKind() === SyntaxKind.SuperKeyword;
		const viaThis = receiver.getKind() === SyntaxKind.ThisKeyword;
		if ((viaThis || (viaSuper && options?.everyThisCall)) && cls) {
			const searchFrom = viaSuper ? declaredBaseClass(cls) : cls;
			const targetMethod = options?.everyThisCall
				? searchFrom && declaredMethodInHierarchy(searchFrom, calledMethodName)
				: cls.getInstanceMethod(calledMethodName);
			// A cycle is an edge in the graph, so only the tree refuses to record it.
			const revisiting = visited.has(calledMethodName);
			if (targetMethod && (options?.everyThisCall || !revisiting)) {
				const condInfo = getConditionalInfo(call, body);
				const iterInfo = getIterationContext(call, body);
				// Recording a revisit is safe; expanding one is not.
				const childResult =
					options?.skipChildScan || revisiting
						? empty
						: scanUsedDependencies(
								targetMethod,
								injectionMap,
								cls,
								new Set(visited)
							);
				sameClassCalls.push({
					assignedTo: extractAssignedVariable(call),
					awaited: isAwaitedCall(call),
					guardThrow: null,
					sortKey: call.getEnd(),
					branchGroupId: condInfo.statementLine
						? `L${condInfo.statementLine}`
						: null,
					branchKind: condInfo.branchKind,
					callSiteLine: call.getStartLineNumber(),
					childResult,
					comment: extractLeadingComment(call),
					conditional: condInfo.isConditional,
					conditionPath: condInfo.conditionPath,
					tryRegion: condInfo.tryRegion,
					conditionText: condInfo.conditionText,
					iterationKind: iterInfo.iterationKind,
					iterationLabel: iterInfo.iterationLabel,
					methodName: calledMethodName,
					order: callOrder++,
					viaSuper,
				});
				continue;
			}
		}

		// Pattern E: Klass.helper(), a static this project declares
		const staticTarget =
			options?.freeCalls &&
			!(viaThis || viaSuper) &&
			receiver.isKind(SyntaxKind.Identifier)
				? staticMethodTarget(receiver, calledMethodName)
				: undefined;
		if (staticTarget) {
			freeCalls.push({
				...staticTarget,
				...callSiteFacts(call, body, callOrder++),
			});
		}
	}

	// Merge guard-throw patterns (fetch + null-check + throw). Same-class, free
	// and static calls join only when the throw survives the merge, since the
	// endpoint tree shows no guard on those and would lose it entirely.
	const guarded = options?.keepMergedThrows
		? [...callEntries, ...memberCalls, ...sameClassCalls, ...freeCalls]
		: [...callEntries, ...memberCalls];
	mergeGuardThrows(
		guarded.sort((a, b) => a.order - b.order),
		throws,
		options?.keepMergedThrows
	);

	// Detect inline logic steps
	const steps: StepUsage[] = [];
	if (body.getKind() === SyntaxKind.Block) {
		// Keyed by node end, which `sortKey` already records, so a statement that
		// merely shares a line with a tracked call is not mistaken for one.
		const trackedEnds = new Set<number>([
			...callEntries.map((entry) => entry.sortKey),
			...throws.map((entry) => entry.sortKey),
			...freeCalls.map((entry) => entry.sortKey),
			...sameClassCalls.map((entry) => entry.sortKey),
			...memberCalls.map((entry) => entry.sortKey),
		]);
		const trackedPositions = new Set<number>(
			returnStatements.map((statement) => statement.getStart())
		);
		for (const node of [...callExpressions, ...throwStatements]) {
			if (trackedEnds.has(node.getEnd())) {
				trackedPositions.add(node.getStart());
			}
		}

		const bodyStatements = body.asKindOrThrow(SyntaxKind.Block).getStatements();
		let pendingStatements: Array<{
			info: { assignedTo: string | null; text: string };
			stmt: Node;
		}> = [];

		const flushPending = () => {
			if (pendingStatements.length === 0) {
				return;
			}
			const firstStmt = pendingStatements[0].stmt;
			const condInfo = getConditionalInfo(firstStmt, body);
			const iterInfo = getIterationContext(firstStmt, body);
			steps.push({
				branchGroupId: condInfo.statementLine
					? `L${condInfo.statementLine}`
					: null,
				branchKind: condInfo.branchKind,
				callSiteLine: firstStmt.getStartLineNumber(),
				conditionPath: condInfo.conditionPath,
				tryRegion: condInfo.tryRegion,
				comment: extractLeadingComment(firstStmt),
				conditional: condInfo.isConditional,
				conditionText: condInfo.conditionText,
				iterationKind: iterInfo.iterationKind,
				iterationLabel: iterInfo.iterationLabel,
				order: 0, // Will be re-assigned
				sortKey: firstStmt.getEnd(),
				statements: pendingStatements.map((p) => p.info),
			});
			pendingStatements = [];
		};

		for (const stmt of bodyStatements) {
			const stmtStart = stmt.getStart();
			const stmtEnd = stmt.getEnd();

			// Check if this statement contains any tracked item
			let hasTracked = false;
			for (const pos of trackedPositions) {
				if (pos >= stmtStart && pos <= stmtEnd) {
					hasTracked = true;
					break;
				}
			}

			if (hasTracked) {
				flushPending();
				continue;
			}

			if (isInterestingStatement(stmt, trackedPositions)) {
				const info = extractStatementInfo(stmt);
				if (info) {
					pendingStatements.push({ info, stmt });
					continue;
				}
			}
			flushPending();
		}
		flushPending();
	}

	// Re-assign order numbers across all items by source position
	{
		type OrderItem =
			| { kind: "call"; item: (typeof callEntries)[number] }
			| { kind: "throw"; item: ThrowUsage }
			| { kind: "member"; item: MemberCallUsage }
			| { kind: "free"; item: FreeCallUsage }
			| { kind: "return"; item: ReturnUsage }
			| { kind: "scc"; item: SameClassCallUsage }
			| { kind: "step"; item: StepUsage };

		const allItems: OrderItem[] = [];
		for (const e of callEntries) {
			allItems.push({ kind: "call", item: e });
		}
		for (const t of throws) {
			allItems.push({ kind: "throw", item: t });
		}
		for (const r of returns) {
			allItems.push({ kind: "return", item: r });
		}
		for (const f of freeCalls) {
			allItems.push({ kind: "free", item: f });
		}
		for (const s of sameClassCalls) {
			allItems.push({ kind: "scc", item: s });
		}
		for (const m of memberCalls) {
			allItems.push({ kind: "member", item: m });
		}
		for (const s of steps) {
			allItems.push({ kind: "step", item: s });
		}
		allItems.sort((a, b) => a.item.sortKey - b.item.sortKey);

		let newOrder = 0;
		for (const ai of allItems) {
			ai.item.order = newOrder++;
		}
	}

	const result: UsedDependency[] = [];
	const classMethodsMap = new Map<string, OrderedMethodUsage[]>();
	for (const entry of callEntries) {
		const className = injectionMap.get(entry.paramName)!;
		if (!classMethodsMap.has(className)) {
			classMethodsMap.set(className, []);
		}
		const isConditional = entry.condInfo.isConditional;
		classMethodsMap.get(className)!.push({
			assignedTo: entry.assignedTo,
			awaited: entry.awaited,
			branchGroupId:
				isConditional && entry.condInfo.statementLine
					? `L${entry.condInfo.statementLine}`
					: null,
			branchKind: isConditional ? entry.condInfo.branchKind : null,
			callSiteLine: entry.callSiteLine,
			comment: entry.comment,
			conditional: isConditional,
			conditionPath: entry.condInfo.conditionPath,
			tryRegion: entry.condInfo.tryRegion,
			conditionText: isConditional ? entry.condInfo.conditionText : null,
			guardThrow: entry.guardThrow,
			iterationKind: entry.iterInfo.iterationKind,
			iterationLabel: entry.iterInfo.iterationLabel,
			member: entry.paramName,
			name: entry.methodName,
			order: entry.order,
		});
	}
	for (const [className, methods] of classMethodsMap) {
		methods.sort((a, b) => a.order - b.order);
		result.push({ className, methodsCalled: methods });
	}

	const scanResult: ScanResult = {
		deps: result,
		freeCalls,
		memberCalls,
		returns,
		sameClassCalls,
		steps,
		throws,
	};
	if (!visitedMethods && cache) {
		cache.setScan(cacheKey, scanResult);
	}
	return scanResult;
}

export function classifyDependency(name: string): DependencyType {
	if (name.endsWith("Repository")) {
		return "repository";
	}
	if (name.endsWith("Guard")) {
		return "guard";
	}
	if (name.endsWith("Interceptor")) {
		return "interceptor";
	}
	if (name.endsWith("Pipe")) {
		return "pipe";
	}
	if (name.endsWith("Filter")) {
		return "filter";
	}
	if (name.endsWith("Gateway")) {
		return "gateway";
	}
	return "service";
}

/**
 * Node allowance for one endpoint's trace, shared by every recursion below it.
 * A diamond in the call graph is re-expanded once per path, so the tree can grow
 * far beyond the number of distinct classes it covers.
 */
interface NodeBudget {
	/** Classes expanded into at least one child, so a subtree is drawn for them. */
	drawn: Set<string>;
	exhausted: boolean;
	/** Classes whose subtree has already been expanded somewhere in this endpoint. */
	expanded: Set<string>;
	remaining: number;
}

/** Takes `n` nodes from the budget. False once nothing is left. */
function claim(budget: NodeBudget, n = 1): boolean {
	if (budget.remaining < n) {
		budget.exhausted = true;
		return false;
	}
	budget.remaining -= n;
	return true;
}

/**
 * Nodes a subtree serialises to, stopping once `limit` is passed. Shared child
 * arrays are one object in memory but a full copy each in the JSON.
 */
function serialisedSize(nodes: MethodDependencyNode[], limit: number): number {
	let total = 0;
	const stack = [...nodes];
	while (stack.length > 0) {
		const node = stack.pop();
		if (!node) {
			break;
		}
		total++;
		if (total > limit) {
			return total;
		}
		stack.push(...node.dependencies);
	}
	return total;
}

function buildMethodDependencyTree(
	scanResult: ScanResult,
	parentClassName: string,
	providers: Map<string, ProviderInfo>,
	visited: Set<string>,
	budget: NodeBudget,
	cache?: ScanCache
): MethodDependencyNode[] {
	const nodes: MethodDependencyNode[] = [];
	const firstSeenClass = new Set<string>();
	const computedChildNodes = new Map<
		string,
		{ nodes: MethodDependencyNode[]; size: number }
	>();
	const usedDeps = scanResult.deps;

	// Build a flat list of all individual method calls across all deps
	interface FlatCall {
		className: string;
		/** Reference to the full UsedDependency for scanning sub-deps */
		dep: UsedDependency;
		mc: OrderedMethodUsage;
	}

	const flatCalls: FlatCall[] = [];
	const fallbackDeps: UsedDependency[] = [];

	for (const dep of usedDeps) {
		if (dep.methodsCalled.length === 0) {
			fallbackDeps.push(dep);
		} else {
			for (const mc of dep.methodsCalled) {
				flatCalls.push({ className: dep.className, mc, dep });
			}
		}
	}

	// Sort by global call order
	flatCalls.sort((a, b) => a.mc.order - b.mc.order);

	// Process fallback deps first (no method tracking)
	for (const dep of fallbackDeps) {
		if (visited.has(dep.className) || firstSeenClass.has(dep.className)) {
			continue;
		}
		if (!claim(budget)) {
			break;
		}
		firstSeenClass.add(dep.className);
		visited.add(dep.className);

		const provider = providers.get(dep.className);
		const fallbackChildDeps: UsedDependency[] = provider
			? provider.dependencies.map((d) => ({
					className: d,
					methodsCalled: [],
				}))
			: [];

		nodes.push({
			assignedTo: null,
			branchGroupId: null,
			branchKind: null,
			callSiteLine: 0,
			className: dep.className,
			comment: null,
			conditional: false,
			conditionText: null,
			dependencies: buildMethodDependencyTree(
				{
					deps: fallbackChildDeps,
					freeCalls: [],
					memberCalls: [],
					returns: [],
					sameClassCalls: [],
					steps: [],
					throws: [],
				},
				dep.className,
				providers,
				new Set(visited),
				budget,
				cache
			),
			endLine: 0,
			filePath: provider?.filePath ?? "",
			guardThrow: null,
			iterationKind: null,
			iterationLabel: null,
			line: 0,
			methodName: null,
			order: 0,
			parameters: [],
			returnType: null,
			stepStatements: [],
			throwMessage: null,
			totalMethods: provider?.publicMethodCount ?? 0,
			type: classifyDependency(dep.className),
		});
	}

	// Collect unique method names per class for sub-dep scanning
	const uniqueMethodsByClass = new Map<string, Set<string>>();
	for (const { className, mc } of flatCalls) {
		if (!uniqueMethodsByClass.has(className)) {
			uniqueMethodsByClass.set(className, new Set());
		}
		uniqueMethodsByClass.get(className)!.add(mc.name);
	}

	// Process method calls in global order
	for (const { className, mc } of flatCalls) {
		// Skip classes already in the ancestor chain (circular dep)
		if (visited.has(className)) {
			continue;
		}
		if (!claim(budget)) {
			break;
		}

		const provider = providers.get(className);
		const isFirst = !firstSeenClass.has(className);
		if (isFirst) {
			firstSeenClass.add(className);
		}

		let childNodes: MethodDependencyNode[] = [];
		let collapsed = false;

		if (!isFirst) {
			const cached = computedChildNodes.get(className);
			if (cached && claim(budget, cached.size)) {
				childNodes = cached.nodes;
			} else {
				collapsed = budget.drawn.has(className);
			}
		} else if (budget.expanded.has(className)) {
			collapsed = budget.drawn.has(className);
		} else if (provider) {
			budget.expanded.add(className);
			const childVisited = new Set(visited);
			childVisited.add(className);
			const injMap = buildInjectionMap(
				provider.classDeclaration,
				providers,
				cache
			);

			// Collect sub-deps from ALL methods of this class (no dedup — each call is its own entry)
			const childCallEntries: Array<{
				assignedTo: string | null;
				awaited: boolean;
				depClassName: string;
				member: string;
				methodName: string;
				order: number;
				callSiteLine: number;
				comment: string | null;
				conditional: boolean;
				conditionPath: ConditionFrame[];
				tryRegion: string | null;
				branchKind: string | null;
				conditionText: string | null;
				branchGroupId: string | null;
				guardThrow: GuardThrow | null;
				iterationKind: "loop" | "callback" | "concurrent" | null;
				iterationLabel: string | null;
			}> = [];
			let childOrder = 0;
			const allSameClassCalls: SameClassCallUsage[] = [];
			const allThrows: ThrowUsage[] = [];
			const uniqueNames =
				uniqueMethodsByClass.get(className) ?? new Set<string>();
			for (const methodName of uniqueNames) {
				const method = findMethodInHierarchy(
					provider.classDeclaration,
					methodName,
					providers,
					cache
				);
				if (!method) {
					continue;
				}
				const subResult = scanUsedDependencies(
					method,
					injMap,
					provider.classDeclaration,
					undefined,
					cache
				);

				// Interleave dep method calls, throws, and same-class calls by original order
				type SubItem =
					| { kind: "dep"; depClassName: string; m: OrderedMethodUsage }
					| { kind: "throw"; t: ThrowUsage }
					| { kind: "scc"; scc: SameClassCallUsage };

				const subItems: SubItem[] = [];
				for (const used of subResult.deps) {
					for (const m of used.methodsCalled) {
						subItems.push({ kind: "dep", depClassName: used.className, m });
					}
				}
				for (const t of subResult.throws) {
					subItems.push({ kind: "throw", t });
				}
				for (const scc of subResult.sameClassCalls) {
					subItems.push({ kind: "scc", scc });
				}
				function subItemOrder(item: SubItem): number {
					if (item.kind === "dep") {
						return item.m.order;
					}
					if (item.kind === "throw") {
						return item.t.order;
					}
					return item.scc.order;
				}
				subItems.sort((a, b) => subItemOrder(a) - subItemOrder(b));

				for (const sub of subItems) {
					if (sub.kind === "dep") {
						childCallEntries.push({
							assignedTo: sub.m.assignedTo,
							awaited: sub.m.awaited,
							depClassName: sub.depClassName,
							member: sub.m.member,
							methodName: sub.m.name,
							order: childOrder++,
							callSiteLine: sub.m.callSiteLine,
							comment: sub.m.comment,
							conditional: sub.m.conditional,
							conditionPath: sub.m.conditionPath,
							tryRegion: sub.m.tryRegion,
							branchKind: sub.m.conditional ? sub.m.branchKind : null,
							conditionText: sub.m.conditional ? sub.m.conditionText : null,
							branchGroupId: sub.m.conditional ? sub.m.branchGroupId : null,
							guardThrow: sub.m.guardThrow,
							iterationKind: sub.m.iterationKind,
							iterationLabel: sub.m.iterationLabel,
						});
					} else if (sub.kind === "throw") {
						allThrows.push({ ...sub.t, order: childOrder++ });
					} else {
						allSameClassCalls.push(sub.scc);
					}
				}
			}

			// Merge guard-throw patterns in child entries
			mergeGuardThrows(childCallEntries, allThrows);

			const childClassMethodsMap = new Map<string, OrderedMethodUsage[]>();
			for (const entry of childCallEntries) {
				if (!childClassMethodsMap.has(entry.depClassName)) {
					childClassMethodsMap.set(entry.depClassName, []);
				}
				childClassMethodsMap.get(entry.depClassName)!.push({
					assignedTo: entry.assignedTo,
					awaited: entry.awaited,
					branchGroupId: entry.branchGroupId,
					branchKind: entry.branchKind,
					callSiteLine: entry.callSiteLine,
					comment: entry.comment,
					conditional: entry.conditional,
					conditionPath: entry.conditionPath,
					tryRegion: entry.tryRegion,
					conditionText: entry.conditionText,
					guardThrow: entry.guardThrow,
					iterationKind: entry.iterationKind,
					iterationLabel: entry.iterationLabel,
					member: entry.member,
					name: entry.methodName,
					order: entry.order,
				});
			}
			const childDeps: UsedDependency[] = [];
			for (const [cn, methods] of childClassMethodsMap) {
				methods.sort((a, b) => a.order - b.order);
				childDeps.push({ className: cn, methodsCalled: methods });
			}

			childNodes = buildMethodDependencyTree(
				{
					deps: childDeps,
					freeCalls: [],
					memberCalls: [],
					returns: [],
					sameClassCalls: allSameClassCalls,
					steps: [],
					throws: allThrows,
				},
				className,
				providers,
				childVisited,
				budget,
				cache
			);
			computedChildNodes.set(className, {
				nodes: childNodes,
				size: serialisedSize(childNodes, budget.remaining),
			});
			if (childNodes.length > 0) {
				budget.drawn.add(className);
			}
		}

		let line = 0;
		let endLine = 0;
		let returnType: string | null = null;
		let parameters: MethodParameterInfo[] = [];
		if (provider) {
			const methodDecl = findMethodInHierarchy(
				provider.classDeclaration,
				mc.name,
				providers,
				cache
			);
			if (methodDecl) {
				line = methodDecl.getStartLineNumber();
				endLine = methodDecl.getEndLineNumber();
				returnType = extractReturnType(methodDecl);
				parameters = extractMethodParameters(methodDecl);
			}
		}

		nodes.push({
			assignedTo: mc.assignedTo,
			branchGroupId: mc.branchGroupId,
			branchKind: mc.branchKind,
			callSiteLine: mc.callSiteLine,
			className,
			comment: mc.comment,
			conditional: mc.conditional,
			conditionText: mc.conditionText,
			dependencies: childNodes,
			endLine,
			filePath: provider?.filePath ?? "",
			guardThrow: mc.guardThrow,
			iterationKind: mc.iterationKind,
			iterationLabel: mc.iterationLabel,
			line,
			methodName: mc.name,
			order: mc.order,
			parameters,
			returnType,
			stepStatements: [],
			throwMessage: null,
			totalMethods: provider?.publicMethodCount ?? 0,
			type: classifyDependency(className),
			...(collapsed ? { expandedElsewhere: true as const } : {}),
		});
	}

	// Process same-class helper calls as intermediate nodes
	const parentProvider = providers.get(parentClassName);
	for (const scc of scanResult.sameClassCalls) {
		if (!claim(budget)) {
			break;
		}
		let line = 0;
		let endLine = 0;
		let sccReturnType: string | null = null;
		let sccParameters: MethodParameterInfo[] = [];
		if (parentProvider) {
			const methodDecl = findMethodInHierarchy(
				parentProvider.classDeclaration,
				scc.methodName,
				providers,
				cache
			);
			if (methodDecl) {
				line = methodDecl.getStartLineNumber();
				endLine = methodDecl.getEndLineNumber();
				sccReturnType = extractReturnType(methodDecl);
				sccParameters = extractMethodParameters(methodDecl);
			}
		}

		const childNodes = buildMethodDependencyTree(
			scc.childResult,
			parentClassName,
			providers,
			new Set(visited),
			budget,
			cache
		);

		nodes.push({
			assignedTo: scc.assignedTo,
			branchGroupId: scc.branchGroupId,
			branchKind: scc.branchKind,
			callSiteLine: scc.callSiteLine,
			className: parentClassName,
			comment: scc.comment,
			conditional: scc.conditional,
			conditionText: scc.conditionText,
			dependencies: childNodes,
			endLine,
			filePath: parentProvider?.filePath ?? "",
			guardThrow: null,
			iterationKind: scc.iterationKind,
			iterationLabel: scc.iterationLabel,
			line,
			methodName: scc.methodName,
			order: scc.order,
			parameters: sccParameters,
			returnType: sccReturnType,
			stepStatements: [],
			throwMessage: null,
			totalMethods: parentProvider?.publicMethodCount ?? 0,
			type: classifyDependency(parentClassName),
		});
	}

	// Process throw statements as leaf nodes
	for (const t of scanResult.throws) {
		if (!claim(budget)) {
			break;
		}
		nodes.push({
			assignedTo: null,
			branchGroupId: t.branchGroupId,
			branchKind: t.branchKind,
			callSiteLine: t.callSiteLine,
			className: t.exceptionClassName,
			comment: t.comment,
			conditional: t.conditional,
			conditionText: t.conditionText,
			dependencies: [],
			endLine: t.callSiteLine,
			filePath: parentProvider?.filePath ?? "",
			guardThrow: null,
			iterationKind: t.iterationKind,
			iterationLabel: t.iterationLabel,
			line: t.callSiteLine,
			methodName: null,
			order: t.order,
			parameters: [],
			returnType: null,
			stepStatements: [],
			throwMessage: t.message,
			totalMethods: 0,
			type: "throw",
		});
	}

	// Process inline logic step nodes
	for (const s of scanResult.steps) {
		if (!claim(budget)) {
			break;
		}
		nodes.push({
			assignedTo: null,
			branchGroupId: s.branchGroupId,
			branchKind: s.branchKind,
			callSiteLine: s.callSiteLine,
			className: "local",
			comment: s.comment,
			conditional: s.conditional,
			conditionText: s.conditionText,
			dependencies: [],
			endLine: s.callSiteLine,
			filePath: parentProvider?.filePath ?? "",
			guardThrow: null,
			iterationKind: s.iterationKind,
			iterationLabel: s.iterationLabel,
			line: s.callSiteLine,
			methodName: null,
			order: s.order,
			parameters: [],
			returnType: null,
			stepStatements: s.statements,
			throwMessage: null,
			totalMethods: 0,
			type: "step",
		});
	}

	// Sort all nodes by call order to preserve interleaved ordering
	nodes.sort((a, b) => a.order - b.order);

	return nodes;
}

function extractResolverRouteInfo(
	method: MethodDeclaration
): { httpMethod: string; path: string } | undefined {
	for (const decorator of method.getDecorators()) {
		const name = decorator.getName();
		if (!GRAPHQL_DECORATORS.has(name)) {
			continue;
		}
		return { httpMethod: name.toUpperCase(), path: method.getName() };
	}
	return undefined;
}

function extractEndpointsFromFile(
	sourceFile: NonNullable<ReturnType<Project["getSourceFile"]>>,
	filePath: string,
	providers: Map<string, ProviderInfo>,
	cache?: ScanCache
): EndpointNode[] {
	const endpoints: EndpointNode[] = [];

	for (const cls of sourceFile.getClasses()) {
		const isCtrl = isController(cls);
		const isRes = hasDecorator(cls, "Resolver");

		if (!(isCtrl || isRes)) {
			continue;
		}

		const controllerPath = isCtrl ? extractControllerPath(cls) : "";
		const controllerName =
			cls.getName() ?? (isCtrl ? "AnonymousController" : "AnonymousResolver");
		const injectionMap = buildInjectionMap(cls, providers, cache);

		for (const method of cls.getMethods()) {
			const routeInfo = isCtrl
				? extractRouteInfo(method)
				: extractResolverRouteInfo(method);
			if (!routeInfo) {
				continue;
			}

			const fullPath = isCtrl
				? composePath(controllerPath, routeInfo.path)
				: routeInfo.path;
			const scanResult = scanUsedDependencies(
				method,
				injectionMap,
				cls,
				undefined,
				cache
			);
			const budget: NodeBudget = {
				drawn: new Set(),
				expanded: new Set(),
				exhausted: false,
				remaining: MAX_DEPENDENCY_NODES,
			};
			const dependencies = buildMethodDependencyTree(
				scanResult,
				controllerName,
				providers,
				new Set(),
				budget,
				cache
			);

			const swagger = extractSwaggerMetadata(method);
			const returnType = extractReturnType(method);

			endpoints.push({
				controllerClass: controllerName,
				dependencies,
				endLine: method.getEndLineNumber(),
				filePath,
				handlerMethod: method.getName(),
				httpMethod: routeInfo.httpMethod,
				line: method.getStartLineNumber(),
				returnType,
				routePath: fullPath,
				swagger,
				...(budget.exhausted ? { truncated: true as const } : {}),
			});
		}
	}

	return endpoints;
}

/** One file's endpoints at a time, over a cache shared across the walk. */
function* traceFiles(
	project: Project,
	files: string[],
	providers: Map<string, ProviderInfo>
): Generator<EndpointNode[]> {
	const cache = new ScanCache();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		yield sourceFile
			? extractEndpointsFromFile(sourceFile, filePath, providers, cache)
			: [];
	}
}

export function buildEndpointGraph(
	project: Project,
	files: string[],
	providers: Map<string, ProviderInfo>
): EndpointGraph {
	return { endpoints: [...traceFiles(project, files, providers)].flat() };
}

/** Same graph, yielding to the event loop after every file it traces. */
export async function buildEndpointGraphWithProgress(
	project: Project,
	files: string[],
	providers: Map<string, ProviderInfo>,
	onFile?: (traced: number, total: number) => void
): Promise<EndpointGraph> {
	const endpoints: EndpointNode[] = [];
	let traced = 0;

	for (const fromFile of traceFiles(project, files, providers)) {
		endpoints.push(...fromFile);
		onFile?.(++traced, files.length);
		await yieldToEventLoop();
	}

	return { endpoints };
}

function traceMethodCalls(
	method: MethodDeclaration,
	injectionMap: Map<string, string>,
	providers: Map<string, ProviderInfo>,
	visited: Set<string>,
	depth: number,
	currentClass?: ClassDeclaration,
	cache?: ScanCache
): MethodCallNode[] {
	if (depth > MAX_TRACE_DEPTH) {
		return [];
	}

	const body = method.getBody();
	if (!body) {
		return [];
	}

	const calls: MethodCallNode[] = [];
	const callExpressions = body.getDescendantsOfKind(SyntaxKind.CallExpression);

	for (const call of callExpressions) {
		const expr = call.getExpression();
		if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) {
			continue;
		}

		const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		const methodName = propAccess.getName();
		const receiver = propAccess.getExpression();

		// Pattern: this.service.method() — injected dependency call
		if (receiver.getKind() === SyntaxKind.PropertyAccessExpression) {
			const innerAccess = receiver.asKindOrThrow(
				SyntaxKind.PropertyAccessExpression
			);
			if (innerAccess.getExpression().getKind() !== SyntaxKind.ThisKeyword) {
				continue;
			}

			const paramName = innerAccess.getName();
			const className = injectionMap.get(paramName);
			if (!className) {
				continue;
			}

			const key = `${className}.${methodName}`;
			if (visited.has(key)) {
				calls.push({
					calls: [],
					circular: true,
					className,
					filePath: "",
					line: 0,
					methodName,
				});
				continue;
			}

			visited.add(key);

			const provider = providers.get(className);
			let childCalls: MethodCallNode[] = [];
			let filePath = "";
			let line = 0;

			if (provider) {
				filePath = provider.filePath;
				const targetMethod =
					provider.classDeclaration.getInstanceMethod(methodName);
				if (targetMethod) {
					line = targetMethod.getStartLineNumber();
					const targetInjectionMap = buildInjectionMap(
						provider.classDeclaration,
						undefined,
						cache
					);
					childCalls = traceMethodCalls(
						targetMethod,
						targetInjectionMap,
						providers,
						new Set(visited),
						depth + 1,
						provider.classDeclaration,
						cache
					);
				}
			}

			calls.push({
				calls: childCalls,
				className,
				filePath,
				line,
				methodName,
			});
		}

		// Pattern: this.method() — same-class private method call
		// Inline children: follow into the private method and surface its dependency calls
		else if (receiver.getKind() === SyntaxKind.ThisKeyword && currentClass) {
			const targetMethod = currentClass.getInstanceMethod(methodName);
			if (!targetMethod) {
				continue;
			}

			const className = currentClass.getName() ?? "Anonymous";
			const key = `${className}.${methodName}`;
			if (visited.has(key)) {
				continue;
			}
			visited.add(key);

			const childCalls = traceMethodCalls(
				targetMethod,
				injectionMap,
				providers,
				new Set(visited),
				depth + 1,
				currentClass,
				cache
			);

			// Inline: surface dependency calls from private methods directly
			calls.push(...childCalls);
		}
	}

	return calls;
}

/**
 * Layer 2: traces method-level call chains for a specific endpoint.
 * Returns the full recursive call tree through injected dependencies.
 */
export function traceEndpointCalls(
	endpoint: EndpointNode,
	providers: Map<string, ProviderInfo>,
	project: Project
): MethodCallNode[] {
	const sourceFile = project.getSourceFile(endpoint.filePath);
	if (!sourceFile) {
		return [];
	}

	const cls = sourceFile
		.getClasses()
		.find((c) => c.getName() === endpoint.controllerClass);
	if (!cls) {
		return [];
	}

	const method = cls.getInstanceMethod(endpoint.handlerMethod);
	if (!method) {
		return [];
	}

	const cache = new ScanCache();
	const injectionMap = buildInjectionMap(cls, undefined, cache);
	return traceMethodCalls(
		method,
		injectionMap,
		providers,
		new Set(),
		0,
		cls,
		cache
	);
}

export function updateEndpointGraphForFile(
	graph: EndpointGraph,
	project: Project,
	filePath: string,
	providers: Map<string, ProviderInfo>
): void {
	// Remove stale endpoints from this file
	graph.endpoints = graph.endpoints.filter((e) => e.filePath !== filePath);

	// Re-scan the changed file
	const sourceFile = project.getSourceFile(filePath);
	if (!sourceFile) {
		return;
	}

	const cache = new ScanCache();
	graph.endpoints.push(
		...extractEndpointsFromFile(sourceFile, filePath, providers, cache)
	);
}
