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

export interface GuardThrow {
	branchKind: string | null;
	callSiteLine: number;
	className: string;
	conditionText: string | null;
	message: string | null;
}

export interface MethodParameterInfo {
	name: string;
	type: string | null;
}

export interface MethodDependencyNode {
	assignedTo: string | null;
	branchGroupId: string | null;
	branchKind: string | null;
	callSiteLine: number;
	className: string;
	comment: string | null;
	conditional: boolean;
	conditionText: string | null;
	dependencies: MethodDependencyNode[];
	endLine: number;
	expandedElsewhere?: true;
	filePath: string;
	guardThrow: GuardThrow | null;
	iterationKind: "loop" | "callback" | "concurrent" | null;
	iterationLabel: string | null;
	line: number;
	methodName: string | null;
	order: number;
	parameters: MethodParameterInfo[];
	returnType: string | null;
	stepStatements: StepStatement[];
	throwMessage: string | null;
	totalMethods: number;
	type: DependencyType;
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

export interface EndpointNode {
	controllerClass: string;
	dependencies: MethodDependencyNode[];
	endLine: number;
	filePath: string;
	handlerMethod: string;
	httpMethod: string;
	line: number;
	returnType: string | null;
	routePath: string;
	swagger: SwaggerMetadata | null;
	truncated?: true;
}

export interface EndpointGraph {
	endpoints: EndpointNode[];
}
