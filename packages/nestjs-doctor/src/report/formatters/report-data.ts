import { readFileSync } from "node:fs";
import type { DiagnoseResult } from "../../common/result.js";
import type { ModuleGraph } from "../../engine/graph/module-graph.js";
import type { ProviderInfo } from "../../engine/graph/type-resolver.js";
import { getRuleExamples } from "../data/examples.js";
import type { ReportScriptData } from "../ui/scripts.js";
import { serializeModuleGraph } from "./module-serializer.js";

function safeJsonForScript(json: string): string {
	return json.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function serializeProviders(providers: Map<string, ProviderInfo>): Array<{
	name: string;
	filePath: string;
	dependencies: string[];
	publicMethodCount: number;
}> {
	return [...providers.values()].map((p) => ({
		name: p.name,
		filePath: p.filePath,
		dependencies: p.dependencies,
		publicMethodCount: p.publicMethodCount,
	}));
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
		files?: string[];
		projects?: string[];
		providers?: Map<string, ProviderInfo>;
	}
): ReportScriptData {
	const graph = serializeModuleGraph(moduleGraph, result, options?.projects);

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
	const serializedProviders = serializeProviders(
		options?.providers ?? new Map()
	);
	const providersJson = safeJsonForScript(JSON.stringify(serializedProviders));
	const schemaJson = safeJsonForScript(
		JSON.stringify(result.schema ?? { entities: [], relations: [], orm: "" })
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
	};
}
