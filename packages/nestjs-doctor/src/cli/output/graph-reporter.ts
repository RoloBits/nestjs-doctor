import type { ModuleGraph } from "../../engine/module-graph.js";
import type { DiagnoseResult } from "../../types/result.js";
import { getRuleExamples } from "./graph/graph-examples.js";
import { getGraphHtml } from "./graph/graph-html.js";
import { getGraphScripts } from "./graph/graph-scripts.js";
import { serializeModuleGraph } from "./graph/graph-serializer.js";
import { getGraphStyles } from "./graph/graph-styles.js";

function safeJsonForScript(json: string): string {
	return json.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

export function generateGraphHtml(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: { projects?: string[] }
): string {
	const graph = serializeModuleGraph(moduleGraph, result, options?.projects);

	const diagnosticsWithoutSource = result.diagnostics.map(
		({ sourceLines: _sl, ...rest }) => rest
	);
	const sourceLinesArray = result.diagnostics.map((d) => d.sourceLines ?? null);

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

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nestjs-doctor — Module Graph</title>
<style>${getGraphStyles()}</style>
</head>
<body>
${getGraphHtml()}
<script>${getGraphScripts({ graphJson, projectJson, diagnosticsJson, summaryJson, elapsedMsJson, sourceLinesJson, examplesJson })}</script>
</body>
</html>`;
}
