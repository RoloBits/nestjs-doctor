import type { ReportArtifact } from "../../../../common/artifact.js";
import type { Category } from "../../../../common/diagnostic.js";
import { onSurface } from "../../../../common/diagnostic.js";
import { Icon } from "../atoms/icon.js";
import { makeScoreRingSvg } from "../lib/score-ring.js";
import { Card, InfoCard, StatCard } from "../molecules/summary-card.js";

const NOT_SCORED_HELP =
	"Reported only · never counts toward the score or a build failure";

const CAT_META: Record<Category, { color: string; label: string }> = {
	security: { label: "Security", color: "var(--cat-security)" },
	correctness: { label: "Correctness", color: "var(--cat-correctness)" },
	schema: { label: "Schema", color: "var(--cat-schema)" },
	architecture: { label: "Architecture", color: "var(--cat-architecture)" },
	performance: { label: "Performance", color: "var(--cat-performance)" },
};

const CAT_ORDER: Category[] = [
	"security",
	"correctness",
	"schema",
	"architecture",
	"performance",
];

const SEVERITIES = [
	{ label: "errors", cssVar: "var(--sev-error)", key: "errors" },
	{ label: "warnings", cssVar: "var(--sev-warning)", key: "warnings" },
	{ label: "info", cssVar: "var(--sev-info)", key: "info" },
] as const;

// Root modules: never imported, named AppModule, or seen bootstrapping.
function countRootModules(graph: ReportArtifact["graph"]): number {
	const importedBy = new Set(graph.edges.map((e) => e.to));
	const roots = new Set<string>();
	for (const m of graph.modules) {
		if (!importedBy.has(m.name) || m.name === "AppModule") {
			roots.add(m.name);
		}
	}
	for (const r of graph.bootstrapRoots ?? []) {
		roots.add(r);
	}
	return roots.size;
}

function ScoreCard({ report }: { report: ReportArtifact }) {
	const sv = report.score.value;
	const stars = Math.round(sv / 20);
	const notScored = report.diagnostics.filter(
		(d) => !onSurface(d, "score")
	).length;
	return (
		<Card fullWidth={true} title="Health Score">
			<div className="ov-score-row">
				<div
					className="ov-score-ring"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG built by our own atom
					dangerouslySetInnerHTML={{ __html: makeScoreRingSvg(120, 6, sv) }}
				/>
				<div className="ov-score-details">
					<div className="ov-score-label">{sv} / 100</div>
					<div className="ov-score-sublabel">{report.score.label}</div>
					<div className="ov-stars">
						{"★".repeat(stars) + "☆".repeat(5 - stars)}
					</div>
					<div className="ov-breakdown">
						{SEVERITIES.map((sev) => (
							<div className="ov-breakdown-item" key={sev.key}>
								<div
									className="ov-breakdown-dot"
									style={{ background: sev.cssVar }}
								/>{" "}
								{report.summary[sev.key]} {sev.label}
							</div>
						))}
					</div>
					{notScored > 0 && (
						<div className="ov-notscored">
							{notScored} of {report.summary.total || 0} not scored
							<span
								aria-label={NOT_SCORED_HELP}
								className="ov-info has-tip"
								data-tip={NOT_SCORED_HELP}
								role="img"
								// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose so the tooltip opens from the keyboard
								tabIndex={0}
							>
								<Icon ariaHidden={true} name="infoDot" size={13} />
							</span>
						</div>
					)}
				</div>
			</div>
		</Card>
	);
}

export function SummaryTab({ report }: { report: ReportArtifact }) {
	const { project, summary, graph } = report;
	return (
		<div className="summary-grid">
			<ScoreCard report={report} />
			<InfoCard
				rows={[
					{ label: "Name", value: project.name },
					{ label: "NestJS", value: project.nestVersion || "—" },
					{ label: "Framework", value: project.framework || "—" },
					{ label: "ORM", value: project.orm || "—" },
					{ label: "Files", value: project.fileCount },
					{ label: "Modules", value: project.moduleCount },
				]}
				title="Project Info"
			/>
			<Card title="Issues by Category">
				{CAT_ORDER.map((cat) => (
					<div className="ov-cat-row" key={cat}>
						<div
							className="ov-cat-icon"
							style={{ background: CAT_META[cat].color }}
						/>
						<span className="ov-cat-name">{CAT_META[cat].label}</span>
						<span className="ov-cat-count">{summary.byCategory[cat] || 0}</span>
					</div>
				))}
			</Card>
			<StatCard
				rows={[
					{ label: "Total modules", value: graph.modules.length },
					{ label: "Root modules", value: countRootModules(graph) },
					{ label: "Edges", value: graph.edges.length },
					{ label: "Circular deps", value: graph.circularDeps.length },
				]}
				title="Module Graph"
			/>
			<StatCard
				rows={[
					{
						label: "Duration",
						value: `${(report.elapsedMs / 1000).toFixed(2)}s`,
					},
					{ label: "Files scanned", value: project.fileCount },
					{ label: "Total issues", value: summary.total },
				]}
				title="Analysis"
			/>
		</div>
	);
}
