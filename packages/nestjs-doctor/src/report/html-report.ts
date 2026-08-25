import { getCliVersion } from "../cli/output.js";
import type { DiagnoseResult } from "../common/result.js";
import type { ModuleGraph } from "../engine/graph/module-graph.js";
import {
	buildReportModel,
	prepareReportData,
	safeJsonForScript,
} from "./formatters/report-data.js";
import type { ReportProvider } from "./model/report-model.js";
import type { BootstrapTimings } from "./timings.js";
import {
	getCodeMirrorImportMap,
	getCodeMirrorScript,
} from "./ui/codemirror.js";
import {
	REPORT_UI_CSS,
	REPORT_UI_JS,
} from "./ui/generated/report-ui.generated.js";
import { getReportHtml } from "./ui/html.js";
import { getReportScripts } from "./ui/scripts.js";
import { getReportStyles } from "./ui/styles.js";
import { getTelemetryScript } from "./ui/telemetry.js";

interface ReportHtmlOptions {
	bootstrapRoots?: string[];
	files?: string[];
	projects?: string[];
	providers?: ReportProvider[];
	reportUi?: boolean;
	telemetry?: boolean;
	timings?: BootstrapTimings;
}

const OPEN_ANGLE = /</g;

// The nestjs-doctor logo (packages/website/public/logo.png at 64px), inlined
// so the report needs no extra request for it.
const FAVICON_DATA_URI =
	"data:image/png;base64,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";

export function buildHtmlReport(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: ReportHtmlOptions
): string {
	const telemetry =
		options?.telemetry === false ? "" : getTelemetryScript(getCliVersion());

	if (options?.reportUi) {
		return buildReactReport(moduleGraph, result, options, telemetry);
	}

	const data = prepareReportData(moduleGraph, result, options);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nestjs-doctor — Health Report</title>
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@200;400;500;600;700&display=swap">
<style>${getReportStyles()}</style>
${getCodeMirrorImportMap()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js" integrity="sha512-psLUZfcgPmi012lcpVHkWoOqyztollwCGu4w/mXijFMK/YcdUdP06voJNVOJ7f/dUIlO2tGlDLuypRyXX2lcvQ==" crossorigin="anonymous"></script>
${telemetry}
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

function buildReactReport(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options: ReportHtmlOptions,
	telemetry: string
): string {
	const model = buildReportModel(moduleGraph, result, options);
	// Every "<" becomes \u003c: JSON-safe, and </script cannot close the tag.
	const data = `<script id="nd-report-data" type="application/json">${JSON.stringify(model).replace(OPEN_ANGLE, "\\u003c")}</script>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nestjs-doctor — Health Report</title>
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@200;400;500;600;700&display=swap">
<style>${REPORT_UI_CSS}</style>
${telemetry}
</head>
<body>
<div id="root" class="nd-report"></div>
${data}
<script>${safeJsonForScript(REPORT_UI_JS)}</script>
<script>NDReport.mountReport(document.getElementById("root"));</script>
</body>
</html>`;
}
