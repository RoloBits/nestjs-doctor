import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReportArtifact } from "../../../common/artifact.js";
import { SummaryTab } from "./templates/summary.js";

// The report page's DOM, without pulling lib.dom into the CLI's typecheck.
declare const document: {
	getElementById(id: string): globalThis.Element | null;
};

const roots = new Map<string, Root>();

// Renders synchronously so callers can read the DOM right after, like the
// string renderers they replace.
function mount(containerId: string, node: ReactNode): void {
	const container = document.getElementById(containerId);
	if (!container) {
		return;
	}
	let root = roots.get(containerId);
	if (!root) {
		root = createRoot(container);
		roots.set(containerId, root);
	}
	flushSync(() => root.render(node));
}

export function renderSummary(report: ReportArtifact): void {
	mount("tab-summary", <SummaryTab report={report} />);
}
