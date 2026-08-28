import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReportArtifact } from "../../../common/artifact.js";
import {
	type DiagnosisCallbacks,
	DiagnosisTab,
} from "./templates/diagnosis.js";
import { EndpointsTab, resizeEndpointsCanvas } from "./templates/endpoints.js";
import { LabTab, labOpened as labOpenedImpl } from "./templates/lab.js";
import {
	jumpToSlowestBoot as jumpToSlowestBootImpl,
	ModulesTab,
	openModule as openModuleImpl,
	resizeModulesCanvas,
} from "./templates/modules.js";
import { SchemaTab } from "./templates/schema.js";
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

export function renderEndpoints(report: ReportArtifact): void {
	mount("tab-endpoints", <EndpointsTab report={report} />);
}

export function resizeEndpoints(): void {
	resizeEndpointsCanvas();
}

export function renderSchema(report: ReportArtifact): void {
	mount("tab-schema", <SchemaTab report={report} />);
}

export function renderModules(report: ReportArtifact): void {
	mount("tab-modules", <ModulesTab report={report} />);
}

export function resizeModules(): void {
	resizeModulesCanvas();
}

export function jumpToSlowestBoot(): void {
	jumpToSlowestBootImpl();
}

export function openModule(name: string): void {
	openModuleImpl(name);
}

export function renderLab(report: ReportArtifact): void {
	mount("tab-lab", <LabTab report={report} />);
}

export function labOpened(): void {
	labOpenedImpl();
}
