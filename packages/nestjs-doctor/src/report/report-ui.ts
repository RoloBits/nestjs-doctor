/** Browser-only surface for hosting the report UI outside the CLI page. */
export type { ReportArtifact } from "../common/artifact.js";
// biome-ignore lint/performance/noBarrelFile: this is the report-ui entry surface
export { REPORT_ARTIFACT_VERSION } from "../common/artifact.js";
export type { SharedReport } from "../common/share.js";
export { SHARED_REPORT_VERSION } from "../common/share.js";
export type { ParsedReportFile } from "./shared-view.js";
export {
	initialTab,
	parseReportFile,
	sharedHiddenTabs,
	sharedReportToArtifact,
} from "./shared-view.js";
export * from "./ui/app/entry.js";
export { Modal } from "./ui/app/molecules/modal.js";
export { getReportHtml } from "./ui/html.js";
export { getReportStyles } from "./ui/styles.js";
