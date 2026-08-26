import type { Diagnostic } from "./diagnostic.js";
import type { EndpointGraph } from "./endpoint.js";
import type {
	DiagnoseSummary,
	ProjectInfo,
	RuleErrorInfo,
	Score,
} from "./result.js";
import type { SerializedSchemaGraph } from "./schema.js";
import type { ScopeInfo } from "./scope.js";
import type {
	BootPhases,
	ClassTiming,
	HookTiming,
	TraceNode,
} from "./timings.js";

/**
 * Version of the report artifact shape. Bump when a field changes meaning;
 * consumers narrow on this literal after checking it.
 */
export const REPORT_ARTIFACT_VERSION = 1;

/** How much scanned source text an artifact embeds. */
export type SourceInclusion = "none" | "touched" | "all";

/** A rule's bad/good example pair, keyed by rule id. */
export type RuleExampleMap = Record<string, { bad: string; good: string }>;

/** A provider as any UI needs it: no ts-morph node, safe to serialise. */
export interface ReportProvider {
	dependencies: string[];
	filePath: string;
	/** Owning module, prefixed with the sub-project in a monorepo. */
	module?: string;
	name: string;
	project?: string;
	publicMethodCount: number;
	scope?: "request" | "transient";
}

export interface SerializedModuleNode {
	controllers: string[];
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	hookTimings?: HookTiming[];
	imports: string[];
	initTimings?: ClassTiming[];
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
	phases?: BootPhases;
	projects: string[];
	startupMs?: number;
	timingsAvailable?: boolean;
	timingsTrace?: Record<string, TraceNode>;
}

/**
 * Everything an interactive report needs, as one plain-JSON document.
 * The engine produces it; HTML, `--format report-json`, and any future UI
 * consume the same bytes.
 */
export interface ReportArtifact {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	endpoints: EndpointGraph;
	examples: RuleExampleMap;
	generatedAt: string;
	generator: { name: "nestjs-doctor"; version: string };
	graph: SerializedModuleGraph;
	monorepo: boolean;
	project: ProjectInfo;
	providers: ReportProvider[];
	ruleErrors: RuleErrorInfo[];
	schema: SerializedSchemaGraph;
	schemaVersion: typeof REPORT_ARTIFACT_VERSION;
	/** What `diagnostics` covers. Absent when nothing was narrowed. */
	scope?: ScopeInfo;
	score: Score;
	/** Full source text keyed by absolute posix path. */
	sources: Record<string, string>;
	summary: DiagnoseSummary;
}
