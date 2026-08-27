import type { Diagnostic } from "./diagnostic";
import type { EndpointGraph } from "./endpoint";
import type {
	DiagnoseSummary,
	ProjectInfo,
	RuleErrorInfo,
	Score,
} from "./result";
import type { SerializedSchemaGraph } from "./schema";
import type { ScopeInfo } from "./scope";
import type { ShareManifest } from "./share";
import type { BootPhases, ClassTiming, HookTiming, TraceNode } from "./timings";

/** Version of the report artifact shape. Bump when a field changes meaning. */
const REPORT_ARTIFACT_VERSION = 1;

export interface RuleExampleMap {
	[ruleId: string]: { bad: string; good: string };
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
	scope?: ScopeInfo;
	score: Score;
	share: ShareManifest;
	/** Full source text keyed by absolute posix path. */
	sources: Record<string, string>;
	summary: DiagnoseSummary;
}
