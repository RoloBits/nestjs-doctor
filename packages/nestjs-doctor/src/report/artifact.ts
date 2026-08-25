import { readFileSync } from "node:fs";
import {
	REPORT_ARTIFACT_VERSION,
	type ReportArtifact,
	type ReportProvider,
	type SourceInclusion,
} from "../common/artifact.js";
import { forSurface } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import type { SerializedSchemaGraph } from "../common/schema.js";
import type { ModuleGraph } from "../engine/graph/module-graph.js";
import type { ProviderInfo } from "../engine/graph/type-resolver.js";
import { getRuleExamples } from "./data/examples.js";
import { serializeModuleGraph } from "./formatters/module-serializer.js";
import type { BootstrapTimings } from "./timings.js";

const EMPTY_SCHEMA: SerializedSchemaGraph = {
	entities: [],
	relations: [],
	orm: "",
};

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

function readSources(paths: string[]): Record<string, string> {
	const sources: Record<string, string> = {};
	for (const filePath of paths) {
		try {
			sources[filePath] = readFileSync(filePath, "utf-8");
		} catch {
			// Skip files that can't be read
		}
	}
	return sources;
}

interface ReportArtifactInput {
	bootstrapRoots?: string[];
	files?: string[];
	moduleGraph: ModuleGraph;
	monorepo?: boolean;
	projects?: string[];
	providers?: ReportProvider[];
	result: DiagnoseResult;
	sources?: SourceInclusion;
	timings?: BootstrapTimings;
	version: string;
}

/** The one place report-shaped data is assembled. */
export function buildReportArtifact(
	input: ReportArtifactInput
): ReportArtifact {
	const shown = forSurface(input.result.diagnostics, "cli");

	let paths: string[];
	switch (input.sources ?? "all") {
		case "none":
			paths = [];
			break;
		case "touched":
			paths = [...new Set(shown.map((d) => d.filePath))];
			break;
		default:
			paths = [
				...new Set([...(input.files ?? []), ...shown.map((d) => d.filePath)]),
			];
	}

	return {
		schemaVersion: REPORT_ARTIFACT_VERSION,
		generator: { name: "nestjs-doctor", version: input.version },
		generatedAt: new Date().toISOString(),
		monorepo: input.monorepo ?? false,
		project: input.result.project,
		score: input.result.score,
		summary: input.result.summary,
		...(input.result.scope ? { scope: input.result.scope } : {}),
		diagnostics: shown,
		ruleErrors: input.result.ruleErrors,
		elapsedMs: input.result.elapsedMs,
		graph: serializeModuleGraph(
			input.moduleGraph,
			input.result,
			input.projects,
			input.bootstrapRoots,
			input.timings
		),
		providers: input.providers ?? [],
		endpoints: input.result.endpoints ?? { endpoints: [] },
		schema: input.result.schema ?? EMPTY_SCHEMA,
		examples: getRuleExamples(),
		sources: readSources(paths),
	};
}
