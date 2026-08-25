/** The payload the CLI serialises into the `nd-report-data` script tag. */
export type Severity = "error" | "warning" | "info";

export interface SourceLine {
	line: number;
	text: string;
}

export interface CodeDiagnostic {
	category: string;
	column: number;
	filePath: string;
	help: string;
	line: number;
	message: string;
	rule: string;
	scope?: string;
	severity: Severity;
	sourceLines?: SourceLine[];
	surfaces?: string[];
	tags?: string[];
}

export interface SchemaDiagnostic {
	category: string;
	entity: string;
	filePath: string;
	help: string;
	message: string;
	rule: string;
	schemaColumn?: string;
	scope?: string;
	severity: Severity;
	surfaces?: string[];
	tags?: string[];
}

export type Diagnostic = CodeDiagnostic | SchemaDiagnostic;

export interface Score {
	label: string;
	value: number;
}

export interface ReportProjectMeta {
	fileCount: number;
	framework: string | null;
	moduleCount: number;
	name: string;
	nestVersion: string | null;
	orm: string | null;
	score: Score;
}

export interface DiagnoseSummary {
	byCategory: Record<string, number>;
	errors: number;
	info: number;
	total: number;
	warnings: number;
}

export interface SerializedModuleNode {
	controllers: string[];
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	hookTimings?: unknown[];
	imports: string[];
	initTimings?: Array<{ className: string; initTime: number }>;
	isGlobal?: boolean;
	line?: number;
	name: string;
	project?: string;
	providers: string[];
	providerTokens?: string[];
}

export interface SerializedModuleGraph {
	bootstrapRoots?: string[];
	circularDepRecommendations: Record<string, string>;
	circularDeps: string[][];
	edges: Array<{ from: string; to: string }>;
	modules: SerializedModuleNode[];
	phases?: { createMs?: number; initMs?: number; moduleInitMs?: number };
	projects: string[];
	startupMs?: number;
	timingsAvailable?: boolean;
	timingsTrace?: Record<
		string,
		{ deps: string[]; initTime: number; name: string; type: string }
	>;
}

export interface SerializedSchemaGraph {
	entities: unknown[];
	orm: string;
	relations: unknown[];
}

export interface MethodDependencyNode {
	assignedTo?: string | null;
	branchGroupId?: string | null;
	branchKind?: string | null;
	callSiteLine?: number;
	className: string;
	conditional?: boolean;
	dependencies?: MethodDependencyNode[];
	expandedElsewhere?: boolean;
	filePath?: string;
	line?: number;
	methodName: string;
	order?: number;
	totalMethods?: number;
	type: string;
}

export interface EndpointNodePayload {
	controllerClass: string;
	dependencies: MethodDependencyNode[];
	endLine?: number;
	filePath: string;
	handlerMethod: string;
	httpMethod: string;
	line: number;
	returnType?: string | null;
	routePath: string;
	swagger?: unknown;
	truncated?: true;
}

export interface EndpointGraphPayload {
	endpoints: EndpointNodePayload[];
}

export interface ReportProvider {
	dependencies: string[];
	filePath: string;
	module?: string;
	name: string;
	project?: string;
	publicMethodCount: number;
	scope?: "request" | "transient";
}

export interface ReportModel {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	endpoints: EndpointGraphPayload;
	examples: Record<string, { bad: string; good: string }>;
	fileSources: Record<string, string>;
	graph: SerializedModuleGraph;
	project: ReportProjectMeta;
	providers: ReportProvider[];
	schema: SerializedSchemaGraph;
	sourceLines: Array<SourceLine[] | null>;
	summary: DiagnoseSummary;
}
