/**
 * Classifies a dependency's role in the NestJS application.
 */
export type DependencyType =
	| "service"
	| "repository"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter"
	| "gateway"
	| "step"
	| "throw"
	| "unknown";

export interface StepStatement {
	assignedTo: string | null;
	text: string;
}

/**
 * Merged guard-throw info attached to a call node when the return value
 * is immediately null-checked and throws an exception.
 */
export interface GuardThrow {
	branchKind: string | null;
	callSiteLine: number;
	className: string;
	conditionText: string | null;
	message: string | null;
}

/**
 * A per-method dependency node. Each method call becomes its own node
 * so that call order and conditionality are visible in the graph.
 */
export interface MethodDependencyNode {
	/** Variable name the return value is assigned to (e.g. "existing" from `const existing = ...`) */
	assignedTo: string | null;
	/** Shared ID for mutually exclusive branches from the same conditional (e.g., "L358") */
	branchGroupId: string | null;
	/** Branch type: "if" | "else-if" | "else" | "case" | "default" | "catch" | "ternary-true" | "ternary-false" */
	branchKind: string | null;
	/** Line where the call to this dependency is made in the parent method */
	callSiteLine: number;
	className: string;
	/** Leading comment above the call site (e.g. "Verify pool belongs to organization") */
	comment: string | null;
	conditional: boolean;
	/** Condition expression text (e.g., "!owner"), null if unconditional */
	conditionText: string | null;
	dependencies: MethodDependencyNode[];
	/** Last line of the method declaration (for full-function highlighting) */
	endLine: number;
	filePath: string;
	/** Merged guard-throw for call nodes (fetch + null-check + throw pattern) */
	guardThrow: GuardThrow | null;
	/** Iteration context: "loop" | "callback" | "concurrent" | null */
	iterationKind: "loop" | "callback" | "concurrent" | null;
	/** Short label for the construct: "map" | "forEach" | "for-of" | "all" | etc. */
	iterationLabel: string | null;
	line: number;
	methodName: string | null;
	order: number;
	/** Method parameter names and types (from TS signature) */
	parameters: MethodParameterInfo[];
	/** Return type from TS method signature (unwrapped from Promise/Observable) */
	returnType: string | null;
	/** Inline logic statements for step nodes (only populated when type === "step") */
	stepStatements: StepStatement[];
	/** Exception message for standalone throw nodes */
	throwMessage: string | null;
	totalMethods: number;
	type: DependencyType;
}

export interface MethodParameterInfo {
	name: string;
	type: string | null;
}

export interface ApiBodyInfo {
	description: string | null;
	type: string | null;
}

export interface ApiParamInfo {
	description: string | null;
	name: string;
	required: boolean;
	type: string | null;
}

export interface ApiResponseInfo {
	description: string | null;
	status: number;
	type: string | null;
}

export interface SwaggerMetadata {
	body: ApiBodyInfo | null;
	description: string | null;
	params: ApiParamInfo[];
	queryParams: ApiParamInfo[];
	responses: ApiResponseInfo[];
	summary: string | null;
}

/**
 * Represents a single HTTP endpoint in a NestJS controller.
 * Contains a per-method dependency tree.
 */
export interface EndpointNode {
	controllerClass: string;
	dependencies: MethodDependencyNode[];
	/** Last line of the handler method (for full-function highlighting) */
	endLine: number;
	filePath: string;
	handlerMethod: string;
	httpMethod: string;
	line: number;
	/** Return type from TS method signature (unwrapped from Promise/Observable) */
	returnType: string | null;
	routePath: string;
	/** Swagger/OpenAPI metadata, null when no swagger decorators present */
	swagger: SwaggerMetadata | null;
}

/**
 * Layer 2: method-level call trace node for deep dependency analysis.
 * Computed on demand via traceEndpointCalls().
 */
export interface MethodCallNode {
	calls: MethodCallNode[];
	circular?: boolean;
	className: string;
	filePath: string;
	line: number;
	methodName: string;
}

/**
 * Complete endpoint dependency graph for a NestJS project.
 * JSON-safe — contains no Maps or AST references.
 */
export interface EndpointGraph {
	endpoints: EndpointNode[];
}
