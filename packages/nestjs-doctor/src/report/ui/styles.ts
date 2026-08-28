import { REPORT_FONT_STACK } from "./font.js";
import base from "./styles/base.css?raw";
import boot from "./styles/boot.css?raw";
import diagnosis from "./styles/diagnosis.css?raw";
import endpoints from "./styles/endpoints.css?raw";
import header from "./styles/header.css?raw";
import hoverCard from "./styles/hover-card.css?raw";
import lab from "./styles/lab.css?raw";
import modulesGraph from "./styles/modules-graph.css?raw";
import responsive from "./styles/responsive.css?raw";
import schema from "./styles/schema.css?raw";
import summary from "./styles/summary.css?raw";

const TRAILING_NEWLINE = /\n$/;

// Concatenation order is the cascade order. responsive.css overrides
// same-specificity rules from every sheet above it, so it stays last.
const SHEETS = [
	base.replace("REPORT_FONT_STACK", REPORT_FONT_STACK),
	header,
	modulesGraph,
	boot,
	hoverCard,
	diagnosis,
	summary,
	lab,
	schema,
	endpoints,
	responsive,
];

export function getReportStyles(): string {
	return `\n${SHEETS.map((sheet) => sheet.replace(TRAILING_NEWLINE, "")).join("\n\n")}`;
}
