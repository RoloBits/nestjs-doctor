import { TAB_DIAGNOSIS } from "./templates/tab-diagnosis.js";
import { TAB_ENDPOINTS } from "./templates/tab-endpoints.js";
import { TAB_LAB } from "./templates/tab-lab.js";
import { TAB_MODULES_GRAPH } from "./templates/tab-modules-graph.js";
import { TAB_SCHEMA } from "./templates/tab-schema.js";
import { TAB_SUMMARY } from "./templates/tab-summary.js";

export function getReportHtml(): string {
	// Concatenation order is the DOM order of the report body.
	return [
		`\n<div id="header-row1"></div>\n<div id="header-row2"></div>\n`,
		TAB_SUMMARY,
		TAB_DIAGNOSIS,
		TAB_LAB,
		TAB_SCHEMA,
		TAB_ENDPOINTS,
		TAB_MODULES_GRAPH,
	].join("");
}
