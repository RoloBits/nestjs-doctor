import type { Diagnostic, SourceLine } from "../../common/diagnostic.js";
import type { EndpointGraph } from "../../common/endpoint.js";
import type { DiagnoseSummary, Score } from "../../common/result.js";
import type { SerializedSchemaGraph } from "../../common/schema.js";
import type { ProviderInfo } from "../../engine/graph/type-resolver.js";
import type { SerializedModuleGraph } from "../formatters/module-serializer.js";

/** A provider as the report needs it: no ts-morph node, safe to keep and serialise. */
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

/** Everything the report UI renders, as typed data. */
export interface ReportModel {
	diagnostics: Diagnostic[];
	elapsedMs: number;
	endpoints: EndpointGraph;
	examples: Record<string, { bad: string; good: string }>;
	fileSources: Record<string, string>;
	graph: SerializedModuleGraph;
	project: ReportProjectMeta;
	providers: ReportProvider[];
	schema: SerializedSchemaGraph;
	/** Parallel to `diagnostics`: the stripped sourceLines, joined back by index. */
	sourceLines: Array<SourceLine[] | null>;
	summary: DiagnoseSummary;
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

export function toReportProvider(
	provider: ProviderInfo,
	owner?: { module?: string; project?: string }
): ReportProvider {
	return {
		dependencies: provider.dependencies,
		filePath: provider.filePath,
		name: provider.name,
		publicMethodCount: provider.publicMethodCount,
		scope: provider.scope,
		module: owner?.module,
		project: owner?.project,
	};
}

/** The legacy payload shape: every field pre-stringified for script interpolation. */
export interface ReportScriptData {
	diagnosticsJson: string;
	elapsedMsJson: string;
	endpointsJson: string;
	examplesJson: string;
	fileSourcesJson: string;
	graphJson: string;
	projectJson: string;
	providersJson: string;
	schemaJson: string;
	sourceLinesJson: string;
	summaryJson: string;
}
