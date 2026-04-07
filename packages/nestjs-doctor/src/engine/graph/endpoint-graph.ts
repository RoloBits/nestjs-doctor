import type {
	CallExpression,
	ClassDeclaration,
	MethodDeclaration,
	Node,
	Project,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	ApiBodyInfo,
	ApiParamInfo,
	ApiResponseInfo,
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
import {
	HTTP_DECORATORS,
	hasDecorator,
	isController,
} from "../nest-class-inspector.js";
import { extractSimpleTypeName, type ProviderInfo } from "./type-resolver.js";

const MAX_TRACE_DEPTH = 10;
const QUOTE_REGEX = /^['"`]|['"`]$/g;
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
	branchKind:
		| "if"
		| "else-if"
		| "else"
		| "case"
		| "default"
		| "catch"
		| "ternary-true"
		| "ternary-false"
		| null;
	conditionText: string | null;
	isConditional: boolean;
	statementLine: number | null;
}

interface OrderedMethodUsage {
	assignedTo: string | null;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionText: string | null;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	name: string;
	order: number;
}

interface UsedDependency {
	className: string;
	methodsCalled: OrderedMethodUsage[];
}

interface SameClassCallUsage {
	assignedTo: string | null;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	childResult: ScanResult;
	comment: string | null;
	conditional: boolean;
	conditionText: string | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	methodName: string;
	order: number;
}

interface ThrowUsage {
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionText: string | null;
	exceptionClassName: string;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	merged?: boolean;
	message: string | null;
	order: number;
}

interface StepUsage {
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	comment: string | null;
	conditional: boolean;
	conditionText: string | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	order: number;
	statements: StepStatement[];
}

interface ScanResult {
	deps: UsedDependency[];
	sameClassCalls: SameClassCallUsage[];
	steps: StepUsage[];
	throws: ThrowUsage[];
}

class ScanCache {
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

const MAX_CONDITION_TEXT_LENGTH = 50;

function normalizeConditionText(text: string): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length > MAX_CONDITION_TEXT_LENGTH) {
		return `${collapsed.slice(0, MAX_CONDITION_TEXT_LENGTH)}\u2026`;
	}
	return collapsed;
}

function getConditionalInfo(node: Node, boundary: Node): ConditionalInfo {
	const none: ConditionalInfo = {
		isConditional: false,
		conditionText: null,
		branchKind: null,
		statementLine: null,
	};

	let current: Node | undefined = node;
	while (current && current !== boundary) {
		const parent = current.getParent();
		if (!parent || parent === boundary) {
			break;
		}
		const parentKind = parent.getKind();

		if (parentKind === SyntaxKind.IfStatement) {
			const ifStmt = parent.asKindOrThrow(SyntaxKind.IfStatement);
			if (current === ifStmt.getThenStatement()) {
				// Check if this IfStatement is an else-if: is it the ElseStatement of a parent IfStatement?
				const grandparent = parent.getParent();
				if (grandparent && grandparent.getKind() === SyntaxKind.IfStatement) {
					const outerIf = grandparent.asKindOrThrow(SyntaxKind.IfStatement);
					if (parent === outerIf.getElseStatement()) {
						return {
							isConditional: true,
							conditionText: normalizeConditionText(
								ifStmt.getExpression().getText()
							),
							branchKind: "else-if",
							statementLine: outerIf.getStartLineNumber(),
						};
					}
				}
				return {
					isConditional: true,
					conditionText: normalizeConditionText(
						ifStmt.getExpression().getText()
					),
					branchKind: "if",
					statementLine: ifStmt.getStartLineNumber(),
				};
			}
			if (current === ifStmt.getElseStatement()) {
				return {
					isConditional: true,
					conditionText: normalizeConditionText(
						ifStmt.getExpression().getText()
					),
					branchKind: "else",
					statementLine: ifStmt.getStartLineNumber(),
				};
			}
		}

		if (parentKind === SyntaxKind.ConditionalExpression) {
			const condExpr = parent.asKindOrThrow(SyntaxKind.ConditionalExpression);
			if (current === condExpr.getWhenTrue()) {
				return {
					isConditional: true,
					conditionText: normalizeConditionText(
						condExpr.getCondition().getText()
					),
					branchKind: "ternary-true",
					statementLine: condExpr.getStartLineNumber(),
				};
			}
			if (current === condExpr.getWhenFalse()) {
				return {
					isConditional: true,
					conditionText: normalizeConditionText(
						condExpr.getCondition().getText()
					),
					branchKind: "ternary-false",
					statementLine: condExpr.getStartLineNumber(),
				};
			}
		}

		const kind = current.getKind();
		if (kind === SyntaxKind.CaseClause) {
			const clause = current.asKindOrThrow(SyntaxKind.CaseClause);
			const parentSwitch = current.getParentOrThrow().getParentOrThrow();
			return {
				isConditional: true,
				conditionText: normalizeConditionText(clause.getExpression().getText()),
				branchKind: "case",
				statementLine: parentSwitch.getStartLineNumber(),
			};
		}
		if (kind === SyntaxKind.DefaultClause) {
			const parentSwitch = current.getParentOrThrow().getParentOrThrow();
			return {
				isConditional: true,
				conditionText: null,
				branchKind: "default",
				statementLine: parentSwitch.getStartLineNumber(),
			};
		}
		if (kind === SyntaxKind.CatchClause) {
			const parentTry = current.getParentOrThrow();
			return {
				isConditional: true,
				conditionText: null,
				branchKind: "catch",
				statementLine: parentTry.getStartLineNumber(),
			};
		}

		current = parent;
	}
	return none;
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
				return { iterationKind: "loop", iterationLabel: loopLabel };
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

function findMethodInHierarchy(
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
	const visited = new Set<string>();

	while (current) {
		const name = current.getName();
		if (name && visited.has(name)) {
			break;
		}
		if (name) {
			visited.add(name);
		}

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
	const decorator = cls.getDecorator("Controller");
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
	return undefined;
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

function extractReturnType(method: MethodDeclaration): string | null {
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

function extractMethodParameters(
	method: MethodDeclaration
): MethodParameterInfo[] {
	return method
		.getParameters()
		.filter((p) => p.getName() !== "this")
		.map((p) => ({
			name: p.getName(),
			type: p.getTypeNode()?.getText() ?? null,
		}));
}

const CONDENSED_ARROW_BODY_REGEX = /=>\s*\{[^}]*\}/g;
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

function buildInjectionMap(
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
	throws: ThrowUsage[]
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
	// Remove merged throws in-place
	const kept = throws.filter((t) => !t.merged);
	throws.length = 0;
	for (const t of kept) {
		throws.push(t);
	}
}

function scanUsedDependencies(
	method: MethodDeclaration,
	injectionMap: Map<string, string>,
	cls?: ClassDeclaration,
	visitedMethods?: Set<string>,
	cache?: ScanCache
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
	const throws: ThrowUsage[] = [];

	// Flat array: each dependency call gets its own entry (no dedup by method name)
	const callEntries: Array<{
		assignedTo: string | null;
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

	type WorkItem =
		| { kind: "call"; node: (typeof callExpressions)[number] }
		| { kind: "throw"; node: (typeof throwStatements)[number] };

	const workItems: WorkItem[] = [
		...callExpressions.map((node) => ({ kind: "call" as const, node })),
		...throwStatements.map((node) => ({ kind: "throw" as const, node })),
	];
	workItems.sort((a, b) => a.node.getStart() - b.node.getStart());

	for (const item of workItems) {
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
				conditionText: condInfo.conditionText,
				exceptionClassName: extractThrowClassName(item.node),
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

		// Pattern C: this.method() — same-class helper call (preserve hierarchy)
		if (receiver.getKind() === SyntaxKind.ThisKeyword && cls) {
			const targetMethod = cls.getInstanceMethod(calledMethodName);
			if (targetMethod && !visited.has(calledMethodName)) {
				const condInfo = getConditionalInfo(call, body);
				const iterInfo = getIterationContext(call, body);
				const childResult = scanUsedDependencies(
					targetMethod,
					injectionMap,
					cls,
					new Set(visited)
				);
				sameClassCalls.push({
					assignedTo: extractAssignedVariable(call),
					branchGroupId: condInfo.statementLine
						? `L${condInfo.statementLine}`
						: null,
					branchKind: condInfo.branchKind,
					callSiteLine: call.getStartLineNumber(),
					childResult,
					comment: extractLeadingComment(call),
					conditional: condInfo.isConditional,
					conditionText: condInfo.conditionText,
					iterationKind: iterInfo.iterationKind,
					iterationLabel: iterInfo.iterationLabel,
					methodName: calledMethodName,
					order: callOrder++,
				});
			}
		}
	}

	// Merge guard-throw patterns (fetch + null-check + throw)
	mergeGuardThrows(callEntries, throws);

	// Detect inline logic steps
	const steps: StepUsage[] = [];
	if (body.getKind() === SyntaxKind.Block) {
		const trackedPositions = new Set<number>();
		for (const entry of callEntries) {
			// Find the actual CallExpression node at this position
			for (const ce of callExpressions) {
				if (ce.getStartLineNumber() === entry.callSiteLine) {
					trackedPositions.add(ce.getStart());
				}
			}
		}
		for (const t of throws) {
			for (const ts of throwStatements) {
				if (ts.getStartLineNumber() === t.callSiteLine) {
					trackedPositions.add(ts.getStart());
				}
			}
		}
		for (const scc of sameClassCalls) {
			for (const ce of callExpressions) {
				if (ce.getStartLineNumber() === scc.callSiteLine) {
					trackedPositions.add(ce.getStart());
				}
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
				comment: extractLeadingComment(firstStmt),
				conditional: condInfo.isConditional,
				conditionText: condInfo.conditionText,
				iterationKind: iterInfo.iterationKind,
				iterationLabel: iterInfo.iterationLabel,
				order: 0, // Will be re-assigned
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
	if (steps.length > 0) {
		type OrderItem =
			| { kind: "call"; item: (typeof callEntries)[number] }
			| { kind: "throw"; item: ThrowUsage }
			| { kind: "scc"; item: SameClassCallUsage }
			| { kind: "step"; item: StepUsage };

		const allItems: OrderItem[] = [];
		for (const e of callEntries) {
			allItems.push({ kind: "call", item: e });
		}
		for (const t of throws) {
			allItems.push({ kind: "throw", item: t });
		}
		for (const s of sameClassCalls) {
			allItems.push({ kind: "scc", item: s });
		}
		for (const s of steps) {
			allItems.push({ kind: "step", item: s });
		}
		allItems.sort((a, b) => a.item.callSiteLine - b.item.callSiteLine);

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
			branchGroupId:
				isConditional && entry.condInfo.statementLine
					? `L${entry.condInfo.statementLine}`
					: null,
			branchKind: isConditional ? entry.condInfo.branchKind : null,
			callSiteLine: entry.callSiteLine,
			comment: entry.comment,
			conditional: isConditional,
			conditionText: isConditional ? entry.condInfo.conditionText : null,
			guardThrow: entry.guardThrow,
			iterationKind: entry.iterInfo.iterationKind,
			iterationLabel: entry.iterInfo.iterationLabel,
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
		sameClassCalls,
		steps,
		throws,
	};
	if (!visitedMethods && cache) {
		cache.setScan(cacheKey, scanResult);
	}
	return scanResult;
}

function classifyDependency(name: string): DependencyType {
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

function buildMethodDependencyTree(
	scanResult: ScanResult,
	parentClassName: string,
	providers: Map<string, ProviderInfo>,
	visited: Set<string>,
	cache?: ScanCache
): MethodDependencyNode[] {
	const nodes: MethodDependencyNode[] = [];
	const firstSeenClass = new Set<string>();
	const computedChildNodes = new Map<string, MethodDependencyNode[]>();
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
					sameClassCalls: [],
					steps: [],
					throws: [],
				},
				dep.className,
				providers,
				new Set(visited),
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

		const provider = providers.get(className);
		const isFirst = !firstSeenClass.has(className);
		if (isFirst) {
			firstSeenClass.add(className);
		}

		let childNodes: MethodDependencyNode[] = [];

		if (isFirst && provider) {
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
				depClassName: string;
				methodName: string;
				order: number;
				callSiteLine: number;
				comment: string | null;
				conditional: boolean;
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
							depClassName: sub.depClassName,
							methodName: sub.m.name,
							order: childOrder++,
							callSiteLine: sub.m.callSiteLine,
							comment: sub.m.comment,
							conditional: sub.m.conditional,
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
					branchGroupId: entry.branchGroupId,
					branchKind: entry.branchKind,
					callSiteLine: entry.callSiteLine,
					comment: entry.comment,
					conditional: entry.conditional,
					conditionText: entry.conditionText,
					guardThrow: entry.guardThrow,
					iterationKind: entry.iterationKind,
					iterationLabel: entry.iterationLabel,
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
					sameClassCalls: allSameClassCalls,
					steps: [],
					throws: allThrows,
				},
				className,
				providers,
				childVisited,
				cache
			);
			computedChildNodes.set(className, childNodes);
		} else if (!isFirst) {
			childNodes = computedChildNodes.get(className) ?? [];
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
		});
	}

	// Process same-class helper calls as intermediate nodes
	const parentProvider = providers.get(parentClassName);
	for (const scc of scanResult.sameClassCalls) {
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
			const dependencies = buildMethodDependencyTree(
				scanResult,
				controllerName,
				providers,
				new Set(),
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
			});
		}
	}

	return endpoints;
}

export function buildEndpointGraph(
	project: Project,
	files: string[],
	providers: Map<string, ProviderInfo>
): EndpointGraph {
	const endpoints: EndpointNode[] = [];
	const cache = new ScanCache();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		endpoints.push(
			...extractEndpointsFromFile(sourceFile, filePath, providers, cache)
		);
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
