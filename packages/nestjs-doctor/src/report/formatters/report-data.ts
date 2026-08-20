import { readFileSync } from "node:fs";
import type { DiagnoseResult } from "../../common/result.js";
import type { ModuleGraph } from "../../engine/graph/module-graph.js";
import type { ProviderInfo } from "../../engine/graph/type-resolver.js";
import { getRuleExamples } from "../data/examples.js";
import type { ClassTiming } from "../timings.js";
import type { ReportScriptData } from "../ui/scripts.js";
import { serializeModuleGraph } from "./module-serializer.js";

function safeJsonForScript(json: string): string {
	return json.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

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

function buildFileSources(files: string[]): Record<string, string> {
	const sources: Record<string, string> = {};
	for (const filePath of files) {
		try {
			sources[filePath] = readFileSync(filePath, "utf-8");
		} catch {
			// Skip files that can't be read
		}
	}
	return sources;
}

export function prepareReportData(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: {
		bootstrapRoots?: string[];
		files?: string[];
		projects?: string[];
		providers?: ReportProvider[];
		timingsByModule?: Map<string, ClassTiming[]>;
	}
): ReportScriptData {
	const graph = serializeModuleGraph(
		moduleGraph,
		result,
		options?.projects,
		options?.bootstrapRoots,
		options?.timingsByModule
	);

	const diagnosticsWithoutSource = result.diagnostics.map((d) => {
		if ("sourceLines" in d) {
			const { sourceLines: _sl, ...rest } = d;
			return rest;
		}
		return d;
	});
	const sourceLinesArray = result.diagnostics.map((d) =>
		"sourceLines" in d ? (d.sourceLines ?? null) : null
	);

	const graphJson = safeJsonForScript(JSON.stringify(graph));
	const projectJson = safeJsonForScript(
		JSON.stringify({
			name: result.project.name,
			score: result.score,
			moduleCount: result.project.moduleCount,
			fileCount: result.project.fileCount,
			framework: result.project.framework,
			nestVersion: result.project.nestVersion,
			orm: result.project.orm,
		})
	);
	const diagnosticsJson = safeJsonForScript(
		JSON.stringify(diagnosticsWithoutSource)
	);
	const summaryJson = safeJsonForScript(JSON.stringify(result.summary));
	const elapsedMsJson = safeJsonForScript(JSON.stringify(result.elapsedMs));
	const sourceLinesJson = safeJsonForScript(JSON.stringify(sourceLinesArray));
	const examplesJson = safeJsonForScript(JSON.stringify(getRuleExamples()));
	const fileSources = buildFileSources(options?.files ?? []);
	const fileSourcesJson = safeJsonForScript(JSON.stringify(fileSources));
	const serializedProviders = options?.providers ?? [];
	const providersJson = safeJsonForScript(JSON.stringify(serializedProviders));
	const schemaJson = safeJsonForScript(
		JSON.stringify(result.schema ?? { entities: [], relations: [], orm: "" })
	);
	const endpointsJson = safeJsonForScript(
		JSON.stringify(result.endpoints ?? { endpoints: [] })
	);

	return {
		graphJson,
		projectJson,
		diagnosticsJson,
		summaryJson,
		elapsedMsJson,
		sourceLinesJson,
		examplesJson,
		fileSourcesJson,
		providersJson,
		schemaJson,
		endpointsJson,
	};
}
