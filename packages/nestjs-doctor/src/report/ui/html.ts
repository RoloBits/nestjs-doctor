import { HEADER_ROW1 } from "./organisms/header-row1.js";
import { TAB_BAR } from "./organisms/tab-bar.js";
import { TAB_DIAGNOSIS } from "./organisms/tab-diagnosis.js";
import { TAB_ENDPOINTS } from "./organisms/tab-endpoints.js";
import { TAB_LAB } from "./organisms/tab-lab.js";
import { TAB_MODULES_GRAPH } from "./organisms/tab-modules-graph.js";
import { TAB_SCHEMA } from "./organisms/tab-schema.js";
import { TAB_SUMMARY } from "./organisms/tab-summary.js";

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
