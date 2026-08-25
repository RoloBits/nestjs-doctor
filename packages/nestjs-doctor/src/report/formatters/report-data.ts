import { readFileSync } from "node:fs";
import { forSurface } from "../../common/diagnostic.js";
import type { DiagnoseResult } from "../../common/result.js";
import type { ModuleGraph } from "../../engine/graph/module-graph.js";
import { getRuleExamples } from "../data/examples.js";
import type {
	ReportModel,
	ReportProvider,
	ReportScriptData,
} from "../model/report-model.js";
import type { BootstrapTimings } from "../timings.js";
import { serializeModuleGraph } from "./module-serializer.js";

function safeJsonForScript(json: string): string {
	return json.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
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

export function buildReportModel(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: {
		bootstrapRoots?: string[];
		files?: string[];
		projects?: string[];
		providers?: ReportProvider[];
		timings?: BootstrapTimings;
	}
): ReportModel {
	const shown = forSurface(result.diagnostics, "cli");
	const diagnosticsWithoutSource = shown.map((d) => {
		if ("sourceLines" in d) {
			const { sourceLines: _sl, ...rest } = d;
			return rest;
		}
		return d;
	});
	const sourceLinesArray = shown.map((d) =>
		"sourceLines" in d ? (d.sourceLines ?? null) : null
	);

	return {
		graph: serializeModuleGraph(
			moduleGraph,
			result,
			options?.projects,
			options?.bootstrapRoots,
			options?.timings
		),
		project: {
			name: result.project.name,
			score: result.score,
			moduleCount: result.project.moduleCount,
			fileCount: result.project.fileCount,
			framework: result.project.framework,
			nestVersion: result.project.nestVersion,
			orm: result.project.orm,
		},
		diagnostics: diagnosticsWithoutSource,
		sourceLines: sourceLinesArray,
		summary: result.summary,
		elapsedMs: result.elapsedMs,
		examples: getRuleExamples(),
		fileSources: buildFileSources([
			...new Set([...(options?.files ?? []), ...shown.map((d) => d.filePath)]),
		]),
		providers: options?.providers ?? [],
		schema: result.schema ?? { entities: [], relations: [], orm: "" },
		endpoints: result.endpoints ?? { endpoints: [] },
	};
}

/** The string payload the legacy inline script interpolates. */
export function toLegacyScriptData(model: ReportModel): ReportScriptData {
	const json = (value: unknown): string =>
		safeJsonForScript(JSON.stringify(value));

	return {
		graphJson: json(model.graph),
		projectJson: json(model.project),
		diagnosticsJson: json(model.diagnostics),
		summaryJson: json(model.summary),
		elapsedMsJson: json(model.elapsedMs),
		sourceLinesJson: json(model.sourceLines),
		examplesJson: json(model.examples),
		fileSourcesJson: json(model.fileSources),
		providersJson: json(model.providers),
		schemaJson: json(model.schema),
		endpointsJson: json(model.endpoints),
	};
}

export function prepareReportData(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: {
		bootstrapRoots?: string[];
		files?: string[];
		projects?: string[];
		providers?: ReportProvider[];
		timings?: BootstrapTimings;
	}
): ReportScriptData {
	return toLegacyScriptData(buildReportModel(moduleGraph, result, options));
}
