import { useState } from "react";
import {
	formatMs,
	phaseParts,
	slowestBootClass,
} from "./canvas/module-graph-painter";
import { FindingsTab } from "./components/findings-tab";
import { ModulesTab } from "./components/modules-tab";
import { SummaryPanel } from "./components/summary-panel";
import type { ReportModel } from "./model";
import { scoreTone } from "./selectors";

const TABS = [
	"summary",
	"diagnosis",
	"modules",
	"endpoints",
	"schema",
	"lab",
] as const;

export type TabName = (typeof TABS)[number];

const TAB_LABELS: Record<TabName, string> = {
	summary: "Summary",
	diagnosis: "Findings",
	modules: "Modules Graph",
	endpoints: "Endpoints",
	schema: "Relational Schema",
	lab: "Rule Lab",
};

/** The inline beacon injected by the CLI exposes this. */
declare global {
	interface Window {
		__ndTrack?: (name: string) => void;
	}
}

function TabContent({
	focusRequest,
	model,
	tab,
}: {
	focusRequest?: string | null;
	model: ReportModel;
	tab: TabName;
}) {
	switch (tab) {
		case "summary":
			return <SummaryPanel model={model} />;
		case "diagnosis":
			return <FindingsTab model={model} />;
		case "modules":
			return <ModulesTab focusRequest={focusRequest} model={model} />;
		default:
			return (
				<p className="placeholder">
					{TAB_LABELS[tab]} — React port in progress
				</p>
			);
	}
}

export function App({ model }: { model: ReportModel }) {
	const [active, setActive] = useState<TabName>("summary");
	const [focusRequest, setFocusRequest] = useState<string | null>(null);

	const slowest =
		model.graph.timingsAvailable && model.graph.startupMs
			? slowestBootClass(model.graph.timingsTrace)
			: null;
	const bootTip = slowest
		? `Slowest construction chain: ${slowest.name} — click to open it in the modules graph`
		: "";

	const jumpToModule = (name: string): void => {
		setFocusRequest(name);
		setActive("modules");
		window.__ndTrack?.("boot_trace_opened");
	};

	return (
		<div className="nd-report">
			<header className="nd-header">
				<span className="meta-badge">{model.project.name}</span>
				{model.project.nestVersion && (
					<span className="meta-badge">NestJS {model.project.nestVersion}</span>
				)}
				{model.project.framework && (
					<span className="meta-badge">{model.project.framework}</span>
				)}
				<span className="meta-badge">{model.graph.modules.length} modules</span>
				{slowest && model.graph.startupMs && (
					<button
						className="meta-badge boot-badge"
						onClick={() => jumpToModule(slowest.name)}
						title={
							bootTip +
							(phaseParts(model.graph.phases).length
								? ` · ${phaseParts(model.graph.phases)
										.map((p) => `${p.label} ${formatMs(p.ms)}`)
										.join(" · ")}`
								: "")
						}
						type="button"
					>
						time to start ≈ {formatMs(model.graph.startupMs)}
					</button>
				)}
				<span className={`score score-${scoreTone(model.project.score.value)}`}>
					{model.project.score.value} · {model.project.score.label}
				</span>
			</header>
			<div aria-label="Report sections" className="nd-tabs" role="tablist">
				{TABS.map((tab) => (
					<button
						aria-selected={active === tab}
						className={active === tab ? "tab-btn active" : "tab-btn"}
						data-tab={tab}
						key={tab}
						onClick={() => {
							setActive(tab);
							window.__ndTrack?.(tab);
						}}
						role="tab"
						type="button"
					>
						{TAB_LABELS[tab]}
					</button>
				))}
			</div>
			<main>
				{TABS.map((tab) => (
					<section
						className={active === tab ? "tab-panel active" : "tab-panel"}
						id={`tab-${tab}`}
						key={tab}
						role="tabpanel"
					>
						{active === tab ? (
							<TabContent
								focusRequest={tab === "modules" ? focusRequest : null}
								model={model}
								tab={tab}
							/>
						) : null}
					</section>
				))}
			</main>
		</div>
	);
}
