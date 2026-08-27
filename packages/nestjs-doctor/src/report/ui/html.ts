import { HEADER_ROW1 } from "./html/header-row1.js";
import { TAB_BAR } from "./html/tab-bar.js";
import { TAB_DIAGNOSIS } from "./html/tab-diagnosis.js";
import { TAB_ENDPOINTS } from "./html/tab-endpoints.js";
import { TAB_LAB } from "./html/tab-lab.js";
import { TAB_MODULES_GRAPH } from "./html/tab-modules-graph.js";
import { TAB_SCHEMA } from "./html/tab-schema.js";
import { TAB_SUMMARY } from "./html/tab-summary.js";

export function getReportHtml(): string {
	// Concatenation order is the DOM order of the report body.
	return [
		HEADER_ROW1,
		TAB_BAR,
		TAB_SUMMARY,
		TAB_DIAGNOSIS,
		TAB_LAB,
		TAB_SCHEMA,
		TAB_ENDPOINTS,
		TAB_MODULES_GRAPH,
	].join("");
}
