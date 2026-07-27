import type { Category, Diagnostic } from "../common/diagnostic.js";
import { isCodeDiagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult, MonorepoResult } from "../common/result.js";
import type { ScopeInfo } from "../common/scope.js";
import { toRelativePath } from "../engine/fingerprint.js";

/** Lets a CI job find and rewrite its own comment instead of stacking new ones. */
export const MARKDOWN_COMMENT_MARKER = "<!-- nestjs-doctor:summary -->";

const MAX_TABLE_ROWS = 50;
const SEVERITY_ICON = { error: "🔴", warning: "🟡", info: "🔵" } as const;
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const PIPE_RE = /\|/g;
const NEWLINE_RE = /\r?\n/g;

export interface MarkdownReportOptions {
	commitSha?: string;
	monorepo?: MonorepoResult;
	runUrl?: string;
	scope?: ScopeInfo;
	targetPath: string;
	version: string;
	warnings?: string[];
}

const escapeCell = (text: string): string =>
	text.replace(PIPE_RE, "\\|").replace(NEWLINE_RE, " ");

const scoreEmoji = (score: number): string => {
	if (score >= 75) {
		return "🟢";
	}
	if (score >= 50) {
		return "🟡";
	}
	return "🔴";
};

const pluralize = (count: number, noun: string): string =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

const sortDiagnostics = (diagnostics: Diagnostic[]): Diagnostic[] =>
	[...diagnostics].sort((a, b) => {
		const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
		if (bySeverity !== 0) {
			return bySeverity;
		}
		return a.filePath.localeCompare(b.filePath);
	});

const locationOf = (diagnostic: Diagnostic, targetPath: string): string => {
	const path = toRelativePath(targetPath, diagnostic.filePath);
	if (isCodeDiagnostic(diagnostic)) {
		return `\`${path}:${diagnostic.line}\``;
	}
	return `\`${path}\` (${diagnostic.entity})`;
};

function renderHeadline(
	result: DiagnoseResult,
	scope: ScopeInfo | undefined
): string {
	const { score, summary } = result;
	const counts = [
		summary.errors ? pluralize(summary.errors, "error") : null,
		summary.warnings ? pluralize(summary.warnings, "warning") : null,
		summary.info ? `${summary.info} info` : null,
	]
		.filter(Boolean)
		.join(", ");

	const scopeNoun =
		scope?.mode === "changed" ? "introduced by this change" : "reported";
	const findings = summary.total
		? `**${pluralize(summary.total, "finding")}** ${scopeNoun} (${counts}).`
		: `No findings ${scopeNoun}. ✨`;

	return `${scoreEmoji(score.value)} **Score ${score.value}/100 — ${score.label}** · ${findings}`;
}

function renderScopeNote(scope: ScopeInfo | undefined): string[] {
	if (!scope) {
		return [];
	}

	const lines: string[] = [];
	if (scope.degradedFrom) {
		lines.push(
			"> [!WARNING]",
			`> Could not scope to \`${scope.degradedFrom}\` — reporting \`${scope.mode}\` instead. On a shallow CI checkout, set \`fetch-depth: 0\`.`,
			""
		);
	}
	if (scope.mode === "changed" && scope.fixed) {
		lines.push(
			`> ✅ This change also resolved ${pluralize(scope.fixed, "existing finding")}.`,
			""
		);
	}
	if (scope.changedFiles !== undefined) {
		lines.push(
			`<sub>Scope \`${scope.mode}\` over ${pluralize(scope.changedFiles, "changed file")}${scope.baseRef ? ` vs \`${scope.baseRef}\`` : ""}.</sub>`
		);
	}
	return lines.length ? ["", ...lines] : [];
}

function renderCategoryTable(result: DiagnoseResult): string[] {
	const entries = (
		Object.entries(result.summary.byCategory) as [Category, number][]
	).filter(([, count]) => count > 0);

	if (entries.length === 0) {
		return [];
	}

	return [
		"",
		"| Category | Findings |",
		"| --- | ---: |",
		...entries.map(([category, count]) => `| ${category} | ${count} |`),
	];
}

function renderFindingsTable(
	result: DiagnoseResult,
	targetPath: string
): string[] {
	if (result.diagnostics.length === 0) {
		return [];
	}

	const sorted = sortDiagnostics(result.diagnostics);
	const shown = sorted.slice(0, MAX_TABLE_ROWS);
	const rows = shown.map(
		(diagnostic) =>
			`| ${SEVERITY_ICON[diagnostic.severity]} | \`${diagnostic.rule}\` | ${locationOf(diagnostic, targetPath)} | ${escapeCell(diagnostic.message)} |`
	);

	const overflow =
		sorted.length > shown.length
			? [
					"",
					`_… and ${sorted.length - shown.length} more. Run \`npx nestjs-doctor . --verbose\` locally for the full list._`,
				]
			: [];

	return [
		"",
		`<details open><summary><b>Findings (${sorted.length})</b></summary>`,
		"",
		"| | Rule | Location | Message |",
		"| :-: | --- | --- | --- |",
		...rows,
		...overflow,
		"",
		"</details>",
	];
}

function renderMonorepoTable(monorepo: MonorepoResult | undefined): string[] {
	if (!monorepo?.isMonorepo || monorepo.subProjects.length === 0) {
		return [];
	}

	return [
		"",
		"<details><summary><b>Per-project scores</b></summary>",
		"",
		"| Project | Score | Findings |",
		"| --- | ---: | ---: |",
		...monorepo.subProjects.map(
			({ name, result }) =>
				`| \`${name}\` | ${result.score.value}/100 | ${result.summary.total} |`
		),
		"",
		"</details>",
	];
}

function renderFooter(options: MarkdownReportOptions): string[] {
	const parts = [`nestjs-doctor v${options.version}`];
	if (options.scope) {
		parts.push(`scope \`${options.scope.mode}\``);
	}
	if (options.commitSha) {
		parts.push(`commit \`${options.commitSha.slice(0, 7)}\``);
	}
	const line = options.runUrl
		? `<sub>${parts.join(" · ")} · [run details](${options.runUrl})</sub>`
		: `<sub>${parts.join(" · ")}</sub>`;
	return ["", "---", line];
}

/** Renders a result as the markdown a CI job posts. */
export function buildMarkdownReport(
	result: DiagnoseResult,
	options: MarkdownReportOptions
): string {
	const warnings = (options.warnings ?? []).filter(Boolean);

	return [
		MARKDOWN_COMMENT_MARKER,
		"## 🩺 nestjs-doctor",
		"",
		renderHeadline(result, options.scope),
		...renderScopeNote(options.scope),
		...(warnings.length
			? ["", "> [!NOTE]", ...warnings.map((warning) => `> ${warning}`)]
			: []),
		...renderCategoryTable(result),
		...renderFindingsTable(result, options.targetPath),
		...renderMonorepoTable(options.monorepo),
		...renderFooter(options),
		"",
	].join("\n");
}
