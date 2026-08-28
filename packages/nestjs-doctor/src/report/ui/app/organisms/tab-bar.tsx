import { useLayoutEffect, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import { onSurface } from "../../../../common/diagnostic.js";

const TAB_ICON_PROPS = {
	className: "tab-icon",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
	"aria-hidden": true,
};

interface TabDef {
	beta?: boolean;
	diagBadge?: boolean;
	id?: string;
	label: string;
	paths: string;
	tab: string;
}

const TABS: TabDef[] = [
	{
		tab: "summary",
		label: "Summary",
		paths: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
	},
	{
		tab: "diagnosis",
		label: "Findings ",
		paths:
			'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
		diagBadge: true,
	},
	{
		tab: "modules",
		label: "Modules Graph",
		paths:
			'<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
	},
	{
		tab: "endpoints",
		label: "Endpoints ",
		paths:
			'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
		id: "tab-btn-endpoints",
		beta: true,
	},
	{
		tab: "schema",
		label: "Relational Schema",
		paths:
			'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
		id: "tab-btn-schema",
	},
	{
		tab: "lab",
		label: "Rule Lab",
		paths:
			'<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
	},
];

interface TabBarRegistry {
	setActiveTab?: (name: string) => void;
	setDiagnosisBadge?: (withNotScored: boolean) => void;
}

const registry: TabBarRegistry = {};

export function setActiveTab(name: string): void {
	registry.setActiveTab?.(name);
}

export function setDiagnosisBadge(withNotScored: boolean): void {
	registry.setDiagnosisBadge?.(withNotScored);
}

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function switchTab(name: string): void {
	(globalThis as { switchTab?: (name: string) => void }).switchTab?.(name);
}

export function TabBar({ report }: { report: ReportArtifact }) {
	const [active, setActive] = useState("summary");
	const [withNotScored, setWithNotScored] = useState(false);
	useLayoutEffect(() => {
		registry.setActiveTab = setActive;
		registry.setDiagnosisBadge = setWithNotScored;
		return () => {
			registry.setActiveTab = undefined;
			registry.setDiagnosisBadge = undefined;
		};
	}, []);

	/** Matches what the tab lists: the not-scored ones only once they are shown. */
	const shown = report.diagnostics.filter(
		(d) => withNotScored || onSurface(d, "score")
	).length;

	const hidden = (def: TabDef): boolean => {
		if (def.tab === "schema") {
			return report.schema.entities.length === 0;
		}
		if (def.tab === "endpoints") {
			return report.endpoints.endpoints.length === 0;
		}
		return false;
	};

	return (
		<>
			{TABS.map((def) => (
				<button
					className={active === def.tab ? "tab-btn active" : "tab-btn"}
					data-tab={def.tab}
					id={def.id}
					key={def.tab}
					onClick={() => {
						switchTab(def.tab);
						track(def.tab);
					}}
					style={hidden(def) ? { display: "none" } : undefined}
					type="button"
				>
					<svg
						{...TAB_ICON_PROPS}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: static icon paths from this file
						dangerouslySetInnerHTML={{ __html: def.paths }}
					/>
					{def.label}
					{def.diagBadge && (
						<span
							className={
								report.diagnostics.length === 0
									? "count-badge clean"
									: "count-badge"
							}
							id="diagnosis-count-badge"
						>
							{shown}
						</span>
					)}
					{def.beta && <span className="beta-badge">Beta</span>}
				</button>
			))}
			<div className="tab-spacer" />
		</>
	);
}
