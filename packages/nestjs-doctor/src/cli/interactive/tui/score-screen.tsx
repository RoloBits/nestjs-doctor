import { Box, Text, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { DiagnoseResult } from "../../../common/result.js";
import type { TriggerOffer } from "../../../telemetry/environment.js";
import { usableColumns, usableRows } from "../../../ui/terminal.js";
import { formatElapsedTime } from "../../formatters/console-reporter.js";
import type { HookTool } from "../../hook-install.js";
import { groupFindings } from "../findings.js";
import { clampOffset, listCapacity, scrollWindow } from "./navigate.js";
import { NOT_SCORED_TAG, padEnd, ruleNameBudget, truncate } from "./text.js";
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
/** Border, selection bar, padding and the two gaps on a menu row. */
const ROW_CHROME = 11;
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
	/** Uppercase tag shown in nest red after the hint; its label gets the colour sweep. */
	badge?: string;
	hint?: string;
	label: string;
	/** A heading printed above this item, opening a group. */
	section?: string;
}

const OFFER_ACTION: Record<TriggerOffer, MenuAction> = {
	action: "ci",
	hook: "hook",
	skill: "init",
};

export interface MenuOptions {
	findingCount: number;
	hookTool: HookTool;
	offerCi: boolean;
	offerHook: boolean;
	offerInit: boolean;
	recommended: TriggerOffer | null;
	ruleCount: number;
	showMore: boolean;
}

/** The ways to make the scan recur, the recommended one first and badged. */
const recurringItems = (options: MenuOptions): MenuItem[] => {
	const items: MenuItem[] = [];
	if (options.offerCi) {
		items.push({
			action: "ci",
			hint: "Adds a PR-commenting workflow",
			label: "Review every pull request",
		});
	}
	if (options.offerHook) {
		items.push({
			action: "hook",
			hint:
				options.hookTool === "husky"
					? "Edits .husky/pre-commit"
					: "Shows a snippet to paste",
			label: "Check every commit",
		});
	}
	if (options.offerInit) {
		items.push({
			action: "init",
			hint: "Your agent rescans its edits",
			label: "Rescan after every agent edit",
		});
	}
	const wanted = options.recommended && OFFER_ACTION[options.recommended];
	return items
		.map((item) =>
			item.action === wanted ? { ...item, badge: "Recommended" } : item
		)
		.sort(
			(a, b) => Number(b.badge !== undefined) - Number(a.badge !== undefined)
		);
};

/** Puts a heading on the first item, when there is one. */
const withSection = (items: MenuItem[], section: string): MenuItem[] =>
	items.map((item, index) => (index === 0 ? { ...item, section } : item));

export const buildMenuItems = (options: MenuOptions): MenuItem[] => {
	const { findingCount, ruleCount, showMore } = options;
	const scan: MenuItem[] = [];
	if (findingCount > 0) {
		scan.push(
			{
				action: "handoff",
				hint: "Starts it with the findings, or copies the prompt",
				label: "Fix issues with your agent",
			},
			{
				action: "review",
				hint: `${findingCount} findings in ${ruleCount} rules`,
				label: "Review issues",
			}
		);
	}
	scan.push({
		action: "report",
		hint: `${findingCount} finding${findingCount === 1 ? "" : "s"} in an interactive page`,
		label: "Open the HTML report",
	});
	if (showMore) {
		scan.push(
			{
				action: "markdown",
				hint: "The pull request summary, for pasting anywhere",
				label: "Copy findings as markdown",
			},
			{
				action: "share",
				hint: "Pick the sections and save a .json others can open",
				label: "Share the report",
			}
		);
	} else {
		scan.push({
			action: "more",
			hint: "Copy as markdown, share the report",
			label: "More",
		});
	}
	scan.push({ action: "quit", label: "Quit" });
	return [
		...withSection(recurringItems(options), "Keep it running"),
		...withSection(scan, "This scan"),
	];
};

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

const subMark = (
	sub: NonNullable<InteractiveContext["subProjects"]>[number]
): string => {
	if (sub.errors > 0) {
		return "✗";
	}
	if (sub.warnings > 0) {
		return "⚠";
	}
	return "✓";
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

const SHIMMER_MS = 90;
const HUE_STEP_PER_CHAR = 18;
const HUE_STEP_PER_FRAME = 10;

/** A fully saturated, light colour at `hue` degrees, as Ink's `rgb()` string. */
const hueColor = (hue: number): string => {
	const channel = (offset: number): number => {
		const x = Math.abs(((hue / 60 + offset) % 6) - 3) - 1;
		return Math.round(255 * (0.45 + 0.55 * Math.min(1, Math.max(0, x))));
	};
	return `rgb(${channel(0)}, ${channel(4)}, ${channel(2)})`;
};

/** The badged label: one hue per character, the wheel turning one step per frame. */
const ShimmerLabel = ({ text }: { text: string }): React.JSX.Element => {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setFrame((current) => current + 1);
		}, SHIMMER_MS);
		return () => {
			clearInterval(timer);
		};
	}, []);

	return (
		<Text bold>
			{[...text].map((char, index) => (
				<Text
					color={hueColor(
						(index * HUE_STEP_PER_CHAR + frame * HUE_STEP_PER_FRAME) % 360
					)}
					key={`${index}-${char}`}
				>
					{char}
				</Text>
			))}
		</Text>
	);
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
	const columns = usableColumns(stdout.columns);
	const shownScore = useCountUp(score.value);
	const affectedFiles = new Set(diagnostics.map((d) => d.filePath)).size;
	const labelWidth = Math.max(...items.map((item) => item.label.length));

	const subProjects = [...(context.subProjects ?? [])].sort(byWorstScore);
	const paneRows = listCapacity(
		usableRows(stdout.rows),
		CHROME_ROWS +
			items.length +
			2 * items.filter((item) => item.section).length,
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
								const rowActive = isSelected && focus === "list";
								return (
									<Box flexDirection="row" key={sub.name}>
										<Box
											backgroundColor={rowActive ? palette.nestRed : undefined}
											width={1}
										>
											<Text> </Text>
										</Box>
										<Box
											backgroundColor={rowActive ? palette.washRed : undefined}
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
														rowActive ? palette.bright : scoreColor(sub.score)
													}
												>
													{`${String(sub.score).padStart(3)}/100`}
												</Text>
												<Text color={rowActive ? palette.muted : palette.dim}>
													{` ${subMark(sub)}`}
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
										{shownRules.map((group) => {
											const budget = ruleNameBudget(
												panelWidth - 8,
												group.scored ? 0 : NOT_SCORED_TAG.length
											);
											return (
												<Text key={group.rule}>
													<Text color={severityColor(group.severity)}>
														{` ${SEVERITY_MARK[group.severity]} `}
													</Text>
													<Text color={palette.text}>
														{truncate(shortRule(group.rule), budget.width)}
													</Text>
													{budget.tag ? (
														<Text color={palette.dim}>{NOT_SCORED_TAG}</Text>
													) : null}
													<Text color={palette.dim}>
														{` ${group.diagnostics.length}`}
													</Text>
												</Text>
											);
										})}
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
					const hintWidth = Math.max(
						0,
						columns - labelWidth - ROW_CHROME - (item.badge?.length ?? 0)
					);
					return (
						<Box flexDirection="column" key={item.action}>
							{item.section ? (
								<Box marginTop={index > 0 ? 1 : 0}>
									<Text color={palette.muted}>
										{`  ${item.section.toUpperCase()}`}
									</Text>
								</Box>
							) : null}
							<Box flexDirection="row">
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
									{item.badge ? (
										<ShimmerLabel text={padEnd(item.label, labelWidth)} />
									) : (
										<Text
											bold={isSelected}
											color={isSelected ? palette.bright : palette.text}
										>
											{padEnd(item.label, labelWidth)}
										</Text>
									)}
									{item.hint ? (
										<Text color={isSelected ? palette.muted : palette.dim}>
											{truncate(item.hint, hintWidth)}
										</Text>
									) : null}
									{item.badge ? (
										<Text bold color={palette.nestRed}>
											{` ${item.badge.toUpperCase()} `}
										</Text>
									) : null}
								</Box>
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
