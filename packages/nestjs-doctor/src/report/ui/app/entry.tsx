import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReportArtifact } from "../../../common/artifact.js";
import { HeaderRow } from "./organisms/header.js";
import {
	setActiveTab as setActiveTabImpl,
	setDiagnosisBadge as setDiagnosisBadgeImpl,
	TabBar,
} from "./organisms/tab-bar.js";
import {
	BootTab,
	focusBootTrace as focusBootTraceImpl,
} from "./templates/boot.js";
import {
	type DiagnosisCallbacks,
	DiagnosisTab,
} from "./templates/diagnosis.js";
import { EndpointsTab, resizeEndpointsCanvas } from "./templates/endpoints.js";
import { LabTab, labOpened as labOpenedImpl } from "./templates/lab.js";
import {
	ModulesTab,
	openModule as openModuleImpl,
	resizeModulesCanvas,
} from "./templates/modules.js";
import { SchemaTab } from "./templates/schema.js";
import { SummaryTab } from "./templates/summary.js";

const roots = new Map<string, Root>();

/** Host-supplied tweaks for embedding the report outside the CLI page. */
export interface ChromeOptions {
	hiddenTabs?: string[];
	hideShare?: boolean;
	onLoadAnother?: () => void;
}

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

export function renderBoot(report: ReportArtifact): void {
	mount("tab-boot", <BootTab report={report} />);
}

export function focusBootTrace(className?: string): void {
	focusBootTraceImpl(className);
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

export function renderChrome(
	report: ReportArtifact,
	options: ChromeOptions = {}
): void {
	mount(
		"header-row1",
		<HeaderRow
			hideShare={options.hideShare}
			onLoadAnother={options.onLoadAnother}
			report={report}
		/>
	);
	mount(
		"header-row2",
		<TabBar hiddenTabs={options.hiddenTabs} report={report} />
	);
}

export function unmountAll(): void {
	for (const root of roots.values()) {
		root.unmount();
	}
	roots.clear();
}

export function setActiveTab(name: string): void {
	setActiveTabImpl(name);
}

export function setDiagnosisBadge(withNotScored: boolean): void {
	setDiagnosisBadgeImpl(withNotScored);
}
