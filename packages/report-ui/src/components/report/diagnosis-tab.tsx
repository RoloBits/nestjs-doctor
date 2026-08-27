"use client";

import { useMemo, useState } from "react";
import type { ReportArtifact } from "@/lib/model/artifact";
import { isCodeDiagnostic } from "@/lib/model/diagnostic";
import { CodeViewer } from "./code-viewer";

const CATEGORY_COLORS: Record<string, string> = {
	security: "#ea2845",
	correctness: "#f59e0b",
	performance: "#34d3ee",
	architecture: "#a78bfa",
	schema: "#8b5cf6",
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

const REPO_PREFIX_RE = /^\/repo\//;

function severityColor(severity: string): string {
	if (severity === "error") {
		return "#ea2845";
	}
	if (severity === "warning") {
		return "#d29922";
	}
	return "#8b949e";
}

interface DiagnosisTabProps {
	artifact: ReportArtifact;
}

export function DiagnosisTab({ artifact }: DiagnosisTabProps) {
	const [openKey, setOpenKey] = useState<string | null>(null);

	const sorted = useMemo(
		() =>
			[...artifact.diagnostics].sort(
				(a, b) =>
					SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
					a.filePath.localeCompare(b.filePath)
			),
		[artifact.diagnostics]
	);

	const notScored = artifact.diagnostics.some(
		(d) => d.surfaces && !d.surfaces.includes("score")
	);

	return (
		<section className="tab-panel">
			<p className="panel-note">
				{sorted.length} finding{sorted.length === 1 ? "" : "s"}
				{notScored ? " · report-only findings included" : ""}
			</p>
			<ul className="finding-list">
				{sorted.map((d) => {
					const key = isCodeDiagnostic(d)
						? `${d.rule}:${d.filePath}:${d.line}`
						: `${d.rule}:${d.entity}`;
					const open = openKey === key;
					const loc = isCodeDiagnostic(d)
						? `${d.filePath.replace(REPO_PREFIX_RE, "")}:${d.line}`
						: `${d.entity}${d.schemaColumn ? `.${d.schemaColumn}` : ""}`;
					return (
						<li className="finding" key={key}>
							<button
								className="finding-row"
								onClick={() => setOpenKey(open ? null : key)}
								type="button"
							>
								<span
									className="sev-dot"
									style={{ background: severityColor(d.severity) }}
								/>
								<span
									className="cat-chip"
									style={{
										color: CATEGORY_COLORS[d.category] ?? "var(--text-dim)",
									}}
								>
									{d.category}
								</span>
								<span className="finding-msg">{d.message}</span>
								<code className="finding-loc">{loc}</code>
							</button>
							{open && (
								<div className="finding-detail">
									<p>{d.help}</p>
									<p className="rule-id">{d.rule}</p>
									{isCodeDiagnostic(d) && d.sourceLines?.length ? (
										<CodeViewer
											code={d.sourceLines.map((l) => l.text).join("\n")}
										/>
									) : null}
								</div>
							)}
						</li>
					);
				})}
				{sorted.length === 0 && (
					<li className="empty">No findings. Clean scan.</li>
				)}
			</ul>
		</section>
	);
}
