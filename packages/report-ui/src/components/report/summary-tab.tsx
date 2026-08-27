"use client";

import { useMemo } from "react";
import type { ReportArtifact } from "@/lib/model/artifact";

interface SummaryTabProps {
	artifact: ReportArtifact;
}

export function SummaryTab({ artifact }: SummaryTabProps) {
	const byCategory = useMemo(
		() => Object.entries(artifact.summary.byCategory).filter(([, n]) => n > 0),
		[artifact.summary]
	);

	return (
		<section className="tab-panel">
			<div className="summary-cards">
				<div className="card">
					<span className="card-num">{artifact.summary.total}</span>
					<span className="card-label">findings</span>
				</div>
				<div className="card">
					<span className="card-num">{artifact.graph.modules.length}</span>
					<span className="card-label">modules</span>
				</div>
				<div className="card">
					<span className="card-num">
						{artifact.endpoints.endpoints.length}
					</span>
					<span className="card-label">endpoints</span>
				</div>
				<div className="card">
					<span className="card-num">{artifact.schema.entities.length}</span>
					<span className="card-label">tables</span>
				</div>
				<div className="card">
					<span className="card-num">
						{(artifact.elapsedMs / 1000).toFixed(1)}s
					</span>
					<span className="card-label">scan time</span>
				</div>
			</div>
			{byCategory.length > 0 && (
				<ul className="cat-bars">
					{byCategory.map(([category, count]) => (
						<li key={category}>
							<span className="cat-name">{category}</span>
							<progress max={artifact.summary.total} value={count} />
							<span className="cat-count">{count}</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
