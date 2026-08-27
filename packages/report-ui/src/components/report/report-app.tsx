"use client";

import { useEffect, useState } from "react";
import type { ReportArtifact } from "@/lib/model/artifact";
import { type ReportSection, track } from "@/lib/track";
import { DiagnosisTab } from "./diagnosis-tab";
import { EndpointsTab } from "./endpoints-tab";
import { LabTab } from "./lab-tab";
import { ModulesTab } from "./modules-tab";
import { SchemaTab } from "./schema-tab";
import { ScoreRing } from "./score-ring";
import { ShareDialog } from "./share-dialog";
import { SummaryTab } from "./summary-tab";

const TABS: Array<{ id: ReportSection; label: string }> = [
	{ id: "summary", label: "Summary" },
	{ id: "diagnosis", label: "Diagnosis" },
	{ id: "modules", label: "Modules" },
	{ id: "endpoints", label: "Endpoints" },
	{ id: "schema", label: "Schema" },
	{ id: "lab", label: "Rule Lab" },
];

interface ReportAppProps {
	artifact: ReportArtifact;
}

/** The whole report page: header, tab bar and the active panel. */
export function ReportApp({ artifact }: ReportAppProps) {
	const [tab, setTab] = useState<ReportSection>("summary");
	const [sharing, setSharing] = useState(false);

	useEffect(() => {
		track("report_opened");
	}, []);
	useEffect(() => {
		track(`report_section_viewed:${tab}`);
	}, [tab]);

	const showSchema = artifact.schema.entities.length > 0;
	const visibleTabs = TABS.filter((t) => t.id !== "schema" || showSchema);

	return (
		<main className="report-root">
			<header className="report-header">
				<div className="header-brand">
					<ScoreRing
						label={artifact.score.label}
						value={artifact.score.value}
					/>
					<div>
						<h1>{artifact.project.name}</h1>
						<p className="report-meta">
							nest {artifact.project.nestVersion ?? "?"}
							{artifact.project.framework
								? ` · ${artifact.project.framework}`
								: ""}
							{artifact.project.orm ? ` · ${artifact.project.orm}` : ""} ·{" "}
							{artifact.project.fileCount} files · generated{" "}
							{new Date(artifact.generatedAt).toLocaleString()}
						</p>
						<p className="report-meta dim">
							{artifact.generator.name} v{artifact.generator.version}
						</p>
					</div>
				</div>
				<button
					className="share-btn"
					onClick={() => setSharing(true)}
					type="button"
				>
					Share
				</button>
			</header>

			<div className="tab-bar" role="tablist">
				{visibleTabs.map((t) => (
					<button
						aria-selected={tab === t.id}
						className={`tab${tab === t.id ? "active" : ""}`}
						key={t.id}
						onClick={() => setTab(t.id)}
						role="tab"
						type="button"
					>
						{t.label}
					</button>
				))}
			</div>

			{tab === "summary" && <SummaryTab artifact={artifact} />}
			{tab === "diagnosis" && <DiagnosisTab artifact={artifact} />}
			{tab === "modules" && <ModulesTab artifact={artifact} />}
			{tab === "endpoints" && <EndpointsTab artifact={artifact} />}
			{tab === "schema" && <SchemaTab artifact={artifact} />}
			{tab === "lab" && <LabTab artifact={artifact} />}

			{sharing && (
				<ShareDialog artifact={artifact} onClose={() => setSharing(false)} />
			)}
		</main>
	);
}
