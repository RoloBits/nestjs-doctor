import { createRoot } from "react-dom/client";
import { App } from "./app";
import type { ReportModel } from "./model";
import "./styles/report.css";

/** Mounts the report from the `nd-report-data` JSON tag the CLI injects. */
export function mountReport(container: HTMLElement): void {
	const tag = document.getElementById("nd-report-data");
	if (!tag?.textContent) {
		throw new Error("report-ui: missing #nd-report-data payload");
	}
	const model = JSON.parse(tag.textContent) as ReportModel;
	createRoot(container).render(<App model={model} />);
}
