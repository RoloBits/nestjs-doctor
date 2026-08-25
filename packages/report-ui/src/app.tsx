import { useState } from "react";
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

function TabContent({ tab, model }: { model: ReportModel; tab: TabName }) {
	switch (tab) {
		case "summary":
			return <SummaryPanel model={model} />;
		case "diagnosis":
			return <FindingsTab model={model} />;
		case "modules":
			return <ModulesTab model={model} />;
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
						{active === tab ? <TabContent model={model} tab={tab} /> : null}
					</section>
				))}
			</main>
		</div>
	);
}
