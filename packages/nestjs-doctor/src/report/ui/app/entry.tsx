import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReportArtifact } from "../../../common/artifact.js";
import {
	type DiagnosisCallbacks,
	DiagnosisTab,
} from "./templates/diagnosis.js";
import { SummaryTab } from "./templates/summary.js";

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

export function renderDiagnosis(
	report: ReportArtifact,
	callbacks: DiagnosisCallbacks
): void {
	mount(
		"tab-diagnosis",
		<DiagnosisTab callbacks={callbacks} report={report} />
	);
}
