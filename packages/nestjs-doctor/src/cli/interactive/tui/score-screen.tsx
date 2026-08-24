import { Box, Text, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { DiagnoseResult } from "../../../common/result.js";
import { formatElapsedTime } from "../../formatters/console-reporter.js";
import { padEnd, truncate } from "./text.js";
import { getNestBirds, getStarRating, palette, scoreColor } from "./theme.js";
import type { InteractiveContext, MenuAction, Toast } from "./types.js";

const SCORE_BAR_WIDTH = 30;

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

interface ScoreScreenProps {
	busy: boolean;
	context: InteractiveContext;
	items: MenuItem[];
	result: DiagnoseResult;
	selected: number;
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
	items,
	result,
	selected,
	toast,
}: ScoreScreenProps): React.JSX.Element => {
	const { project, score, summary, elapsedMs, diagnostics } = result;
	const { stdout } = useStdout();
	const columns = stdout.columns ?? 80;
	const shownScore = useCountUp(score.value);
	const affectedFiles = new Set(diagnostics.map((d) => d.filePath)).size;
	const labelWidth = Math.max(...items.map((item) => item.label.length));

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

			{context.subProjects && context.subProjects.length > 0 ? (
				<Box flexDirection="column">
					<Text color={palette.muted}>SUB-PROJECTS</Text>
					{context.subProjects.map((sub) => (
						<Text key={sub.name}>
							<Text color={palette.text}>{`  ${padEnd(sub.name, 28)}`}</Text>
							<Text
								color={scoreColor(sub.score)}
							>{`${String(sub.score).padStart(3)}/100`}</Text>
							<Text color={palette.dim}>{subStatus(sub)}</Text>
						</Text>
					))}
				</Box>
			) : null}

			<Box
				borderColor={palette.border}
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
								{item.hint ? (
									<Text color={isSelected ? palette.muted : palette.dim}>
										{truncate(item.hint, Math.max(0, columns - labelWidth - 8))}
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
					{busy ? "working…" : "↑↓ select · enter confirm · q quit"}
				</Text>
			</Box>
		</Box>
	);
};
