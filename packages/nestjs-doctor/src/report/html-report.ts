import type { DiagnoseResult } from "../common/result.js";
import type { ModuleGraph } from "../engine/module-graph.js";
import type { ProviderInfo } from "../engine/type-resolver.js";
import { prepareReportData } from "./formatters/report-data.js";
import {
	getCodeMirrorImportMap,
	getCodeMirrorScript,
} from "./ui/codemirror.js";
import { getReportHtml } from "./ui/html.js";
import { getReportScripts } from "./ui/scripts.js";
import { getReportStyles } from "./ui/styles.js";

export function buildHtmlReport(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: {
		files?: string[];
		projects?: string[];
		providers?: Map<string, ProviderInfo>;
	}
): string {
	const data = prepareReportData(moduleGraph, result, options);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nestjs-doctor — Health Report</title>
<style>${getReportStyles()}</style>
${getCodeMirrorImportMap()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js" integrity="sha512-psLUZfcgPmi012lcpVHkWoOqyztollwCGu4w/mXijFMK/YcdUdP06voJNVOJ7f/dUIlO2tGlDLuypRyXX2lcvQ==" crossorigin="anonymous"></script>
</head>
<body>
${getReportHtml()}
<script>${getReportScripts(data)}</script>
<script type="module">
${getCodeMirrorScript()}
</script>
</body>
</html>`;
}
