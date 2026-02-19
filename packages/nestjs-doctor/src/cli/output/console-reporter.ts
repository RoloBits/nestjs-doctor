import type { Diagnostic } from "../../types/diagnostic.js";
import type { DiagnoseResult, MonorepoResult } from "../../types/result.js";
import { highlighter } from "./highlighter.js";
import { logger } from "./logger.js";

const PERFECT_SCORE = 100;
const SCORE_BAR_WIDTH = 50;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const MILLISECONDS_PER_SECOND = 1000;
const BOX_HORIZONTAL_PADDING = 1;
const BOX_OUTER_INDENT = 2;

const SEVERITY_ORDER: Record<Diagnostic["severity"], number> = {
	error: 0,
	warning: 1,
	info: 2,
};

// --- Helpers ---

interface FramedLine {
	plainText: string;
	renderedText: string;
}

const createFramedLine = (
	plainText: string,
	renderedText: string = plainText
): FramedLine => ({
	plainText,
	renderedText,
});

export const colorizeByScore = (text: string, score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return highlighter.success(text);
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return highlighter.warn(text);
	}
	return highlighter.error(text);
};

const colorizeBySeverity = (
	text: string,
	severity: Diagnostic["severity"]
): string => {
	if (severity === "error") {
		return highlighter.error(text);
	}
	if (severity === "warning") {
		return highlighter.warn(text);
	}
	return highlighter.info(text);
};

export const getSeverityIcon = (severity: Diagnostic["severity"]): string => {
	if (severity === "error") {
		return "✗";
	}
	if (severity === "warning") {
		return "⚠";
	}
	return "●";
};

export const formatElapsedTime = (elapsedMs: number): string => {
	if (elapsedMs < MILLISECONDS_PER_SECOND) {
		return `${Math.round(elapsedMs)}ms`;
	}
	return `${(elapsedMs / MILLISECONDS_PER_SECOND).toFixed(1)}s`;
};

// --- Nest birds ---

export const getNestBirds = (score: number): string[] => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return ["◠ ◠ ◠", "╰───╯"];
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return ["• • •", "╰───╯"];
	}
	return ["x x x", "╰───╯"];
};

// --- Star rating ---

export const getStarRating = (score: number): string => {
	if (score >= 90) {
		return "★★★★★";
	}
	if (score >= 75) {
		return "★★★★☆";
	}
	if (score >= 50) {
		return "★★★☆☆";
	}
	if (score >= 25) {
		return "★★☆☆☆";
	}
	return "★☆☆☆☆";
};

// --- Score bar ---

export const buildScoreBarSegments = (
	score: number
): { filled: string; empty: string } => {
	const filledCount = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH);
	const emptyCount = SCORE_BAR_WIDTH - filledCount;
	return {
		filled: "█".repeat(filledCount),
		empty: "░".repeat(emptyCount),
	};
};

const buildPlainScoreBar = (score: number): string => {
	const { filled, empty } = buildScoreBarSegments(score);
	return `${filled}${empty}`;
};

const buildScoreBar = (score: number): string => {
	const { filled, empty } = buildScoreBarSegments(score);
	return colorizeByScore(filled, score) + highlighter.dim(empty);
};

// --- Framed box ---

export const printFramedBox = (framedLines: FramedLine[]): void => {
	if (framedLines.length === 0) {
		return;
	}

	const borderColorizer = highlighter.dim;
	const outerIndent = " ".repeat(BOX_OUTER_INDENT);
	const horizontalPadding = " ".repeat(BOX_HORIZONTAL_PADDING);
	const maxLineLength = Math.max(...framedLines.map((l) => l.plainText.length));
	const borderLine = "─".repeat(maxLineLength + BOX_HORIZONTAL_PADDING * 2);

	logger.log(`${outerIndent}${borderColorizer(`┌${borderLine}┐`)}`);

	for (const line of framedLines) {
		const trailing = " ".repeat(maxLineLength - line.plainText.length);
		logger.log(
			`${outerIndent}${borderColorizer("│")}${horizontalPadding}${line.renderedText}${trailing}${horizontalPadding}${borderColorizer("│")}`
		);
	}

	logger.log(`${outerIndent}${borderColorizer(`└${borderLine}┘`)}`);
};

// --- Diagnostics grouping ---

const groupByRule = (diagnostics: Diagnostic[]): Map<string, Diagnostic[]> => {
	const groups = new Map<string, Diagnostic[]>();
	for (const d of diagnostics) {
		const key = d.rule;
		const group = groups.get(key) ?? [];
		group.push(d);
		groups.set(key, group);
	}
	return groups;
};

const sortBySeverity = (
	groups: [string, Diagnostic[]][]
): [string, Diagnostic[]][] =>
	[...groups].sort(
		([, a], [, b]) =>
			SEVERITY_ORDER[a[0].severity] - SEVERITY_ORDER[b[0].severity]
	);

const buildFileLineMap = (diagnostics: Diagnostic[]): Map<string, number[]> => {
	const fileLines = new Map<string, number[]>();
	for (const d of diagnostics) {
		const lines = fileLines.get(d.filePath) ?? [];
		if (d.line > 0) {
			lines.push(d.line);
		}
		fileLines.set(d.filePath, lines);
	}
	return fileLines;
};

const collectAffectedFiles = (diagnostics: Diagnostic[]): Set<string> =>
	new Set(diagnostics.map((d) => d.filePath));

// --- Print functions ---

const printDiagnostics = (
	diagnostics: Diagnostic[],
	verbose: boolean
): void => {
	const ruleGroups = groupByRule(diagnostics);
	const sortedGroups = sortBySeverity([...ruleGroups.entries()]);

	for (const [, ruleDiagnostics] of sortedGroups) {
		const first = ruleDiagnostics[0];
		const icon = colorizeBySeverity(
			getSeverityIcon(first.severity),
			first.severity
		);
		const count = ruleDiagnostics.length;
		const countLabel =
			count > 1 ? colorizeBySeverity(` (${count})`, first.severity) : "";

		logger.log(`  ${icon} ${first.message}${countLabel}`);

		if (first.help) {
			logger.dim(`    ${first.help}`);
		}

		if (verbose) {
			const fileLines = buildFileLineMap(ruleDiagnostics);
			for (const [filePath, lines] of fileLines) {
				const lineLabel = lines.length > 0 ? `: ${lines.join(", ")}` : "";
				logger.dim(`    ${filePath}${lineLabel}`);
			}
		}

		logger.break();
	}
};

// --- Main reporter ---

export function printConsoleReport(
	result: DiagnoseResult,
	verbose: boolean
): void {
	const { score, diagnostics, project, summary, elapsedMs } = result;

	logger.break();

	// Build framed summary box
	const framedLines: FramedLine[] = [];
	const scoreColorizer = (text: string): string =>
		colorizeByScore(text, score.value);

	// Nest birds
	const [birds, nest] = getNestBirds(score.value);
	framedLines.push(createFramedLine("┌───────┐", scoreColorizer("┌───────┐")));
	framedLines.push(
		createFramedLine(
			`│ ${birds} │  NestJS Doctor`,
			`${scoreColorizer(`│ ${birds} │`)}  NestJS Doctor`
		)
	);
	framedLines.push(
		createFramedLine(`│ ${nest} │`, scoreColorizer(`│ ${nest} │`))
	);
	framedLines.push(createFramedLine("└───────┘", scoreColorizer("└───────┘")));
	framedLines.push(createFramedLine(""));

	// Score line
	const stars = getStarRating(score.value);
	const scoreLinePlain = `${score.value} / ${PERFECT_SCORE}  ${stars}  ${score.label}`;
	const scoreLineRendered = `${colorizeByScore(String(score.value), score.value)} / ${PERFECT_SCORE}  ${colorizeByScore(stars, score.value)}  ${colorizeByScore(score.label, score.value)}`;
	framedLines.push(createFramedLine(scoreLinePlain, scoreLineRendered));
	framedLines.push(createFramedLine(""));

	// Score bar
	framedLines.push(
		createFramedLine(
			buildPlainScoreBar(score.value),
			buildScoreBar(score.value)
		)
	);
	framedLines.push(createFramedLine(""));

	// Summary counts line
	const elapsed = formatElapsedTime(elapsedMs);
	const affectedFileCount = collectAffectedFiles(diagnostics).size;

	const summaryParts: string[] = [];
	const summaryPartsPlain: string[] = [];

	if (summary.errors > 0) {
		const errorText = `✗ ${summary.errors} error${summary.errors === 1 ? "" : "s"}`;
		summaryPartsPlain.push(errorText);
		summaryParts.push(highlighter.error(errorText));
	}
	if (summary.warnings > 0) {
		const warnText = `⚠ ${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}`;
		summaryPartsPlain.push(warnText);
		summaryParts.push(highlighter.warn(warnText));
	}
	if (summary.info > 0) {
		const infoText = `● ${summary.info} info`;
		summaryPartsPlain.push(infoText);
		summaryParts.push(highlighter.info(infoText));
	}

	if (diagnostics.length === 0) {
		const noIssuesText = "No issues found!";
		summaryPartsPlain.push(noIssuesText);
		summaryParts.push(highlighter.success(noIssuesText));
	}

	const fileCountText =
		diagnostics.length > 0
			? `across ${affectedFileCount}/${project.fileCount} files`
			: `${project.fileCount} files scanned`;
	const elapsedText = `in ${elapsed}`;

	summaryPartsPlain.push(fileCountText);
	summaryPartsPlain.push(elapsedText);
	summaryParts.push(highlighter.dim(fileCountText));
	summaryParts.push(highlighter.dim(elapsedText));

	framedLines.push(
		createFramedLine(summaryPartsPlain.join("  "), summaryParts.join("  "))
	);

	printFramedBox(framedLines);
	logger.break();

	// Project info line
	const projectInfoParts = [`Project: ${project.name}`];
	if (project.nestVersion) {
		projectInfoParts.push(`NestJS ${project.nestVersion}`);
	}
	if (project.orm) {
		projectInfoParts.push(project.orm);
	}
	projectInfoParts.push(`${project.moduleCount} modules`);
	logger.dim(`  ${projectInfoParts.join(" | ")}`);
	logger.break();

	if (diagnostics.length === 0) {
		return;
	}

	// Diagnostics
	printDiagnostics(diagnostics, verbose);

	if (verbose && result.ruleErrors.length > 0) {
		logger.warn(
			`  ${result.ruleErrors.length} rule(s) failed during execution:`
		);
		for (const re of result.ruleErrors) {
			logger.dim(`    ${re.ruleId}: ${re.error}`);
		}
		logger.break();
	}

	if (!verbose) {
		logger.dim("  Run with --verbose for file paths and line numbers");
		logger.break();
	}
}

export function printMonorepoReport(
	monorepoResult: MonorepoResult,
	verbose: boolean
): void {
	// Print combined report first
	printConsoleReport(monorepoResult.combined, verbose);

	// Then print per-project summaries
	logger.log("  Sub-project breakdown:");
	logger.break();

	for (const subProject of monorepoResult.subProjects) {
		const { name, result } = subProject;
		const scoreText = colorizeByScore(
			String(result.score.value),
			result.score.value
		);
		const parts = [
			`${highlighter.info(name)}: ${scoreText}/100`,
			`${result.project.fileCount} files`,
		];

		if (result.summary.errors > 0) {
			parts.push(highlighter.error(`${result.summary.errors} errors`));
		}
		if (result.summary.warnings > 0) {
			parts.push(highlighter.warn(`${result.summary.warnings} warnings`));
		}
		if (result.summary.info > 0) {
			parts.push(`${result.summary.info} info`);
		}
		if (result.diagnostics.length === 0) {
			parts.push(highlighter.success("clean"));
		}

		logger.log(`    ${parts.join("  |  ")}`);
	}

	logger.break();
}
