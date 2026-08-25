/**
 * The report payload contract: what the CLI serialises into the
 * `nd-report-data` script tag and this package renders. Mirrors
 * `packages/nestjs-doctor/src/report/model/report-model.ts` — keep both in
 * step; the Stage 7 parity gate catches drift.
 */

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
	imports: string[];
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
	projects: string[];
}

/** Deep entity/relation shapes arrive with the schema tab (Stage 5). */
export interface SerializedSchemaGraph {
	entities: unknown[];
	orm: string;
	relations: unknown[];
}

/** Deep endpoint shapes arrive with the endpoints tab (Stage 5). */
export interface EndpointGraphPayload {
	endpoints: unknown[];
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
