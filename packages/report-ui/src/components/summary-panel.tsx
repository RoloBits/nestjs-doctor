import type { ReactNode } from "react";
import type { ReportModel } from "../model";
import {
	CAT_META,
	CAT_ORDER,
	isNotScored,
	rootModules,
	scoreTone,
} from "../selectors";
import { ScoreRing } from "./score-ring";

const NOT_SCORED_HELP =
	"Reported only \u00b7 never counts toward the score or a build failure";

function Card({
	children,
	title,
	wide,
}: {
	children: ReactNode;
	title: string;
	wide?: boolean;
}) {
	return (
		<div className={wide ? "ov-card full-width" : "ov-card"}>
			<h3>{title}</h3>
			<div className="ov-card-body">{children}</div>
		</div>
	);
}

export function SummaryPanel({ model }: { model: ReportModel }) {
	const sv = model.project.score.value;
	const stars = Math.round(sv / 20);
	const notScoredCount = model.diagnostics.filter(isNotScored).length;
	const roots = rootModules(model.graph);

	return (
		<div className="summary-grid">
			<Card title="Health Score" wide>
				<div className="ov-score-row">
					<div className="ov-score-ring">
						<ScoreRing size={120} strokeWidth={6} value={sv} />
					</div>
					<div className="ov-score-details">
						<div className="ov-score-label">{sv} / 100</div>
						<div className="ov-score-sublabel">{model.project.score.label}</div>
						<div className="ov-stars" data-tone={scoreTone(sv)}>
							{"\u2605".repeat(stars)}
							{"\u2606".repeat(5 - stars)}
						</div>
						<div className="ov-breakdown">
							{(
								[
									["error", model.summary.errors],
									["warning", model.summary.warnings],
									["info", model.summary.info],
								] as const
							).map(([sev, count]) => (
								<div className="ov-breakdown-item" key={sev}>
									<div
										className="ov-breakdown-dot"
										style={{ background: `var(--sev-${sev})` }}
									/>{" "}
									{count} {sev === "error" ? "errors" : `${sev}s`}
								</div>
							))}
						</div>
						{notScoredCount > 0 && (
							<div className="ov-notscored">
								{notScoredCount} of {model.summary.total} not scored
								<span
									aria-label={NOT_SCORED_HELP}
									className="ov-info"
									data-tip={NOT_SCORED_HELP}
									role="img"
								>
									<svg
										aria-hidden="true"
										fill="none"
										height="13"
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										viewBox="0 0 24 24"
										width="13"
									>
										<circle cx="12" cy="12" r="10" />
										<path d="M12 16v-4" />
										<path d="M12 8h.01" />
									</svg>
								</span>
							</div>
						)}
					</div>
				</div>
			</Card>

			<Card title="Project Info">
				<div className="ov-info-grid">
					{(
						[
							["Name", model.project.name],
							["NestJS", model.project.nestVersion ?? "\u2014"],
							["Framework", model.project.framework ?? "\u2014"],
							["ORM", model.project.orm ?? "\u2014"],
							["Files", String(model.project.fileCount)],
							["Modules", String(model.project.moduleCount)],
						] as const
					).map(([label, value]) => (
						<div className="ov-info-item" key={label}>
							<span className="ov-info-label">{label}</span>
							<span>{value}</span>
						</div>
					))}
				</div>
			</Card>

			<Card title="Issues by Category">
				{CAT_ORDER.map((cat) => (
					<div className="ov-cat-row" key={cat}>
						<div
							className="ov-cat-icon"
							style={{ background: CAT_META[cat].color }}
						/>
						<span className="ov-cat-name">{CAT_META[cat].label}</span>
						<span className="ov-cat-count">
							{model.summary.byCategory[cat] || 0}
						</span>
					</div>
				))}
			</Card>

			<Card title="Module Graph">
				{(
					[
						["Total modules", model.graph.modules.length],
						["Root modules", roots.size],
						["Edges", model.graph.edges.length],
						["Circular deps", model.graph.circularDeps.length],
					] as const
				).map(([label, value]) => (
					<div className="ov-stat-row" key={label}>
						<span className="ov-stat-label">{label}</span>
						<span className="ov-stat-value">{value}</span>
					</div>
				))}
			</Card>

			<Card title="Analysis">
				{(
					[
						["Duration", `${(model.elapsedMs / 1000).toFixed(2)}s`],
						["Files scanned", model.project.fileCount],
						["Total issues", model.summary.total],
					] as const
				).map(([label, value]) => (
					<div className="ov-stat-row" key={label}>
						<span className="ov-stat-label">{label}</span>
						<span className="ov-stat-value">{value}</span>
					</div>
				))}
			</Card>
		</div>
	);
}
