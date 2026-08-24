import { Box, Text, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { DiagnoseResult } from "../../../common/result.js";
import { formatElapsedTime } from "../../formatters/console-reporter.js";
import { groupFindings } from "../findings.js";
import { clampOffset, listCapacity, scrollWindow } from "./navigate.js";
import { padEnd, truncate } from "./text.js";
import {
	getNestBirds,
	getStarRating,
	palette,
	SEVERITY_MARK,
	scoreColor,
	severityColor,
} from "./theme.js";
import type { InteractiveContext, MenuAction, Toast } from "./types.js";

const SCORE_BAR_WIDTH = 30;
/** Nest box, score block, menu borders, footer, and the gaps between them. */
const CHROME_ROWS = 14;
const MIN_SUB_ROWS = 3;

const TOAST_STYLE: Record<
	"error" | "info" | "success",
	{ color: string; mark: string }
> = {
	error: { color: palette.error, mark: "✗ " },
	info: { color: palette.info, mark: "› " },
	success: { color: palette.success, mark: "✓ " },
};

interface MenuItem {
	action: MenuAction;
	/** Uppercase tag shown in nest red between the label and the hint. */
	badge?: string;
	hint?: string;
	label: string;
}

export const buildMenuItems = (
	findingCount: number,
	ruleCount: number,
	offerCi: boolean
): MenuItem[] => [
	...(findingCount > 0
		? [
				{
					action: "review" as const,
					hint: `${findingCount} findings in ${ruleCount} rules`,
					label: "Review issues",
				},
			]
		: []),
	{
		action: "report" as const,
		hint: `${findingCount} finding${findingCount === 1 ? "" : "s"} in an interactive page`,
		label: "Open the HTML report",
	},
	...(findingCount > 0
		? [
				{
					action: "handoff" as const,
					hint: "Start an agent with the findings, or copy the prompt",
					label: "Hand off to an agent",
				},
			]
		: []),
	...(offerCi
		? [
				{
					action: "ci" as const,
					badge: "Recommended",
					hint: "Scaffold .github/workflows/nestjs-doctor.yml",
					label: "Add to GitHub Actions",
				},
			]
		: []),
	{
		action: "markdown" as const,
		hint: "The pull request summary, for pasting anywhere",
		label: "Copy findings as markdown",
	},
	{ action: "quit", label: "Quit" },
];

const NestBox = ({ score }: { score: number }): React.JSX.Element => {
	const birds = getNestBirds(score);
	const color = scoreColor(score);
	return (
		<Box flexDirection="column">
			<Text color={color}>{"┌───────┐"}</Text>
			<Text color={color}>{`│ ${birds.eyes} │`}</Text>
			<Text color={color}>{"│ ╰───╯ │"}</Text>
			<Text color={color}>{"└───────┘"}</Text>
		</Box>
	);
};

const ScoreBar = ({ score }: { score: number }): React.JSX.Element => {
	const filled = Math.round((score / 100) * SCORE_BAR_WIDTH);
	const color = scoreColor(score);
	return (
		<Text>
			<Text color={color}>{"█".repeat(filled)}</Text>
			<Text color={palette.dim}>{"░".repeat(SCORE_BAR_WIDTH - filled)}</Text>
		</Text>
	);
};

const subStatus = (
	sub: NonNullable<InteractiveContext["subProjects"]>[number]
): string => {
	if (sub.errors > 0) {
		return `  ✗ ${sub.errors} errors`;
	}
	if (sub.warnings > 0) {
		return `  ⚠ ${sub.warnings} warnings`;
	}
	return "  ✓ clean";
};

const byWorstScore = (
	a: { name: string; score: number },
	b: { name: string; score: number }
): number => a.score - b.score || a.name.localeCompare(b.name);

const shortRule = (rule: string): string =>
	rule.split("/").slice(1).join("/") || rule;

const keyHints = (
	busy: boolean,
	hasSubProjects: boolean,
	focus: "list" | "menu"
): string => {
	if (busy) {
		return "working…";
	}
	if (!hasSubProjects) {
		return "↑↓ select · enter confirm · q quit";
	}
	return focus === "list"
		? "↑↓ project · ←→ actions · enter confirm · q quit"
		: "↑↓ select · ←→ projects · enter confirm · q quit";
};

interface ScoreScreenProps {
	busy: boolean;
	context: InteractiveContext;
	/** Which pane answers to ↑↓: the sub-project list or the action menu. */
	focus: "list" | "menu";
	items: MenuItem[];
	result: DiagnoseResult;
	selected: number;
	selectedSub: number;
	toast: Toast;
}

const ANIMATION_MS = 800;

/** Eases the score up from zero so the bar and the count load like a gauge. */
const useCountUp = (target: number, durationMs = ANIMATION_MS): number => {
	const [value, setValue] = useState(0);

	useEffect(() => {
		const startedAt = Date.now();
		const timer = setInterval(() => {
			const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
			const eased = 1 - (1 - progress) ** 3;
			setValue(Math.round(target * eased));
			if (progress >= 1) {
				clearInterval(timer);
			}
		}, 33);
		return () => {
			clearInterval(timer);
		};
	}, [target, durationMs]);

	return value;
};

export const ScoreScreen = ({
	busy,
	context,
	focus,
	items,
	result,
	selected,
	selectedSub,
	toast,
}: ScoreScreenProps): React.JSX.Element => {
	const { project, score, summary, elapsedMs, diagnostics } = result;
	const { stdout } = useStdout();
	const columns = stdout.columns ?? 80;
	const shownScore = useCountUp(score.value);
	const affectedFiles = new Set(diagnostics.map((d) => d.filePath)).size;
	const labelWidth = Math.max(...items.map((item) => item.label.length));

	const subProjects = [...(context.subProjects ?? [])].sort(byWorstScore);
	const paneRows = listCapacity(
		stdout.rows ?? 24,
		CHROME_ROWS + items.length,
		MIN_SUB_ROWS
	);
	const subProjectsOverflow = subProjects.length > paneRows - 1;
	const visibleSubRows = Math.max(
		1,
		paneRows - 1 - (subProjectsOverflow ? 1 : 0)
	);
	const [subOffset, setSubOffset] = useState(0);
	const selectedSubRow = Math.min(selectedSub, subProjects.length - 1);
	const safeSubOffset = scrollWindow(
		clampOffset(subOffset, subProjects.length, visibleSubRows),
		selectedSubRow,
		visibleSubRows
	);

	useEffect(() => {
		setSubOffset(safeSubOffset);
	}, [safeSubOffset]);

	const selectedSubProject = subProjects[selectedSubRow];
	const selectedRules = selectedSubProject
		? groupFindings(selectedSubProject.diagnostics)
		: [];
	const rulesRoom = Math.max(0, paneRows - 4);
	const rulesTruncated = selectedRules.length > rulesRoom;
	const shownRules = selectedRules.slice(
		0,
		rulesTruncated ? rulesRoom - 1 : rulesRoom
	);
	const leftContent = Math.max(14, Math.min(42, Math.round(columns * 0.34)));
	const panelWidth = Math.max(12, columns - leftContent - 4);

	const countLabel = (count: number, singular: string): string =>
		`${count} ${singular}${count === 1 ? "" : "s"}`;

	const severityParts: React.JSX.Element[] = [];
	if (summary.errors > 0) {
		severityParts.push(
			<Text color={palette.error} key="errors">
				{`✗ ${countLabel(summary.errors, "error")}`}
			</Text>
		);
	}
	if (summary.warnings > 0) {
		severityParts.push(
			<Text color={palette.warning} key="warnings">
				{`⚠ ${countLabel(summary.warnings, "warning")}`}
			</Text>
		);
	}
	if (summary.info > 0) {
		severityParts.push(
			<Text color={palette.info} key="info">
				{`● ${summary.info} info`}
			</Text>
		);
	}
	if (diagnostics.length === 0) {
		severityParts.push(
			<Text color={palette.success} key="clean">
				No issues found
			</Text>
		);
	}

	const projectBits: string[] = [project.name];
	if (project.nestVersion) {
		projectBits.push(`NestJS ${project.nestVersion}`);
	}
	if (project.orm) {
		projectBits.push(project.orm);
	}
	projectBits.push(`${project.moduleCount} modules`);

	return (
		<Box flexDirection="column" gap={1}>
			<Box flexDirection="row" gap={2}>
				<NestBox score={shownScore} />
				<Box flexDirection="column" justifyContent="center">
					<Text bold color={palette.bright}>
						NESTJS DOCTOR <Text color={palette.dim}>v{context.version}</Text>
					</Text>
					<Text color={palette.muted}>{projectBits.join(" · ")}</Text>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Text bold>
					<Text color={scoreColor(score.value)}>
						{`${shownScore}/100`} {getStarRating(shownScore)}
					</Text>
					<Text color={palette.muted}>{`  ${score.label}`}</Text>
				</Text>
				<ScoreBar score={shownScore} />
				<Text>
					{severityParts.map((part, index) => (
						<Text key={part.key}>
							{index > 0 ? <Text color={palette.dim}>{"  ·  "}</Text> : null}
							{part}
						</Text>
					))}
					{diagnostics.length > 0 ? (
						<Text color={palette.dim}>
							{`  ·  ${affectedFiles}/${project.fileCount} files`}
						</Text>
					) : (
						<Text color={palette.dim}>
							{`  ·  ${project.fileCount} files scanned`}
						</Text>
					)}
					<Text
						color={palette.dim}
					>{`  ·  ${formatElapsedTime(elapsedMs)}`}</Text>
				</Text>
			</Box>

			{subProjects.length > 0 ? (
				<Box flexDirection="row">
					<Box flexDirection="column" flexShrink={0} width={leftContent}>
						<Text
							bold={focus === "list"}
							color={focus === "list" ? palette.bright : palette.muted}
						>
							{" SUB-PROJECTS"}
						</Text>
						{subProjects
							.slice(safeSubOffset, safeSubOffset + visibleSubRows)
							.map((sub, index) => {
								const isSelected = safeSubOffset + index === selectedSubRow;
								return (
									<Box flexDirection="row" key={sub.name}>
										<Box
											backgroundColor={
												isSelected && focus === "list"
													? palette.nestRed
													: undefined
											}
											width={1}
										>
											<Text> </Text>
										</Box>
										<Box
											backgroundColor={
												isSelected && focus === "list"
													? palette.washRed
													: undefined
											}
											flexDirection="row"
											width={leftContent - 1}
										>
											<Text>
												<Text
													bold={isSelected}
													color={isSelected ? palette.bright : palette.text}
												>
													{` ${padEnd(
														truncate(sub.name, leftContent - 12),
														Math.max(0, leftContent - 12)
													)}`}
												</Text>
												<Text
													color={
														isSelected && focus === "list"
															? palette.bright
															: scoreColor(sub.score)
													}
												>
													{`${String(sub.score).padStart(3)}/100`}
												</Text>
												<Text
													color={
														isSelected && focus === "list"
															? palette.muted
															: palette.dim
													}
												>
													{` ${subStatus(sub).slice(2, 3)}`}
												</Text>
											</Text>
										</Box>
									</Box>
								);
							})}
						{subProjectsOverflow ? (
							<Text color={palette.dim}>
								{` … ${safeSubOffset + 1}–${Math.min(safeSubOffset + visibleSubRows, subProjects.length)} of ${subProjects.length}`}
							</Text>
						) : null}
					</Box>
					<Box
						borderBottom={false}
						borderColor={palette.border}
						borderRight={false}
						borderStyle="single"
						borderTop={false}
						flexShrink={0}
					/>
					<Box flexDirection="column" paddingLeft={1} width={panelWidth}>
						{selectedSubProject ? (
							<>
								<Text>
									<Text bold color={palette.bright}>
										{truncate(selectedSubProject.name, panelWidth - 10)}
									</Text>
									<Text color={scoreColor(selectedSubProject.score)}>
										{`  ${selectedSubProject.score}/100`}
									</Text>
								</Text>
								<ScoreBar score={selectedSubProject.score} />
								<Text>
									{selectedSubProject.errors > 0 ? (
										<Text color={palette.error}>
											{`✗ ${selectedSubProject.errors}`}
										</Text>
									) : null}
									{selectedSubProject.errors > 0 &&
									selectedSubProject.warnings > 0 ? (
										<Text color={palette.dim}>{"  ·  "}</Text>
									) : null}
									{selectedSubProject.warnings > 0 ? (
										<Text color={palette.warning}>
											{`⚠ ${selectedSubProject.warnings}`}
										</Text>
									) : null}
									{selectedSubProject.info > 0 ? (
										<Text color={palette.dim}>
											{`  ·  ${selectedSubProject.info} info`}
										</Text>
									) : null}
									{selectedSubProject.diagnostics.length === 0 ? (
										<Text color={palette.success}>✓ clean</Text>
									) : null}
									<Text color={palette.dim}>
										{`  ·  ${selectedSubProject.fileCount} files`}
									</Text>
								</Text>
								{selectedRules.length > 0 ? (
									<Box flexDirection="column" paddingTop={0}>
										<Text color={palette.muted}>{" TOP RULES"}</Text>
										{shownRules.map((group) => (
											<Text key={group.rule}>
												<Text color={severityColor(group.severity)}>
													{` ${SEVERITY_MARK[group.severity]} `}
												</Text>
												<Text color={palette.text}>
													{truncate(shortRule(group.rule), panelWidth - 8)}
												</Text>
												<Text color={palette.dim}>
													{` ${group.diagnostics.length}`}
												</Text>
											</Text>
										))}
										{rulesTruncated ? (
											<Text color={palette.dim}>
												{` … +${selectedRules.length - shownRules.length} more rules`}
											</Text>
										) : null}
									</Box>
								) : null}
							</>
						) : null}
					</Box>
				</Box>
			) : null}

			<Box
				borderColor={focus === "menu" ? palette.nestRed : palette.border}
				borderStyle="single"
				flexDirection="column"
			>
				{items.map((item, index) => {
					const isSelected = index === selected;
					return (
						<Box flexDirection="row" key={item.action}>
							<Box
								backgroundColor={isSelected ? palette.nestRed : undefined}
								width={1}
							>
								<Text> </Text>
							</Box>
							<Box
								backgroundColor={isSelected ? palette.washRed : undefined}
								gap={2}
								paddingLeft={1}
							>
								<Text
									bold={isSelected}
									color={isSelected ? palette.bright : palette.text}
								>
									{padEnd(item.label, labelWidth)}
								</Text>
								{item.badge ? (
									<Text bold color={palette.nestRed}>
										{` ${item.badge.toUpperCase()} `}
									</Text>
								) : null}
								{item.hint ? (
									<Text color={isSelected ? palette.muted : palette.dim}>
										{truncate(
											item.hint,
											Math.max(
												0,
												columns - labelWidth - 8 - (item.badge?.length ?? 0) - 3
											)
										)}
									</Text>
								) : null}
							</Box>
						</Box>
					);
				})}
			</Box>

			<Box flexDirection="column">
				{toast ? (
					<Text color={TOAST_STYLE[toast.kind].color}>
						{TOAST_STYLE[toast.kind].mark}
						{toast.text}
					</Text>
				) : null}
				<Text color={palette.dim}>
					{keyHints(busy, subProjects.length > 0, focus)}
				</Text>
			</Box>
		</Box>
	);
};
