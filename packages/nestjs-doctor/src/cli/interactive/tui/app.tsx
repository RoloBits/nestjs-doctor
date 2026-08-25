import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useMemo, useState } from "react";
import { withSurface } from "../../../engine/result-builder.js";
import { buildMarkdownReport } from "../../../formatters/markdown-report.js";
import {
	openReportInBrowser,
	writeReportFile,
} from "../../../report/output.js";
import {
	ciNextSteps,
	ciWorkflowExists,
	installCiWorkflow,
} from "../../ci-install.js";
import {
	buildHandoffPrompt,
	detectLaunchableAgents,
	type LaunchableAgent,
} from "../agents.js";
import { copyToClipboard } from "../clipboard.js";
import { groupFindings } from "../findings.js";
import { ReviewScreen } from "./review-screen.js";
import { buildMenuItems, ScoreScreen } from "./score-screen.js";
import { padEnd } from "./text.js";
import { palette } from "./theme.js";
import type { InteractiveContext, MenuAction, Toast } from "./types.js";

type Screen = "handoff" | "review" | "score";

interface HandoffItem {
	agent?: LaunchableAgent;
	hint?: string;
	kind: "agent" | "back" | "copy";
	label: string;
}

const buildHandoffItems = (): HandoffItem[] => [
	...detectLaunchableAgents().map((agent) => ({
		agent,
		kind: "agent" as const,
		hint: `Start ${agent.binary} here with the findings as the prompt`,
		label: agent.name,
	})),
	{
		kind: "copy" as const,
		hint: "Paste into any agent or edit it first",
		label: "Copy the prompt",
	},
	{ kind: "back" as const, label: "Back" },
];

interface AppProps {
	context: InteractiveContext;
	deferPrint: (text: string) => void;
	onRequestAgent: (agent: LaunchableAgent, prompt: string) => void;
}

export const App = ({
	context,
	deferPrint,
	onRequestAgent,
}: AppProps): React.JSX.Element => {
	const { exit } = useApp();
	const [screen, setScreen] = useState<Screen>("score");
	const [busy, setBusy] = useState(false);
	const [toast, setToast] = useState<Toast>(null);
	const [selectedAction, setSelectedAction] = useState(0);
	const [selectedHandoff, setSelectedHandoff] = useState(0);
	const [scoreFocus, setScoreFocus] = useState<"list" | "menu">("menu");
	const [selectedSub, setSelectedSub] = useState(0);
	const subCount = context.subProjects?.length ?? 0;

	const shown = useMemo(
		() => withSurface(context.result, "cli"),
		[context.result]
	);
	const ruleCount = useMemo(
		() => groupFindings(shown.diagnostics).length,
		[shown.diagnostics]
	);
	const items = useMemo(
		() =>
			buildMenuItems(
				shown.diagnostics.length,
				ruleCount,
				!ciWorkflowExists(context.targetPath)
			),
		[context.targetPath, ruleCount, shown.diagnostics]
	);
	const handoffItems = useMemo(() => buildHandoffItems(), []);

	const copyHandoffPrompt = useCallback(async (): Promise<void> => {
		const prompt = buildHandoffPrompt(shown.diagnostics, context.targetPath);
		if (await copyToClipboard(prompt)) {
			setToast({
				kind: "success",
				text: "Prompt copied. Paste it into any agent.",
			});
		} else {
			deferPrint(prompt);
			setToast({
				kind: "info",
				text: "No clipboard tool found; the prompt prints when you quit.",
			});
		}
		setScreen("score");
	}, [context.targetPath, deferPrint, shown.diagnostics]);

	const runAction = useCallback(
		async (action: MenuAction): Promise<void> => {
			if (action === "quit") {
				exit();
				return;
			}
			if (action === "review") {
				setToast(null);
				setScreen("review");
				return;
			}
			if (action === "handoff") {
				setToast(null);
				setSelectedHandoff(0);
				setScreen("handoff");
				return;
			}

			setBusy(true);
			try {
				if (action === "report") {
					const html = context.buildReportHtml();
					const reportPath = await writeReportFile(context.targetPath, html);
					openReportInBrowser(reportPath, (message) => {
						setToast({ kind: "error", text: message });
					});
					setToast({
						kind: "success",
						text: `Report written to ${reportPath}`,
					});
				} else if (action === "ci") {
					const outcome = await installCiWorkflow(context.targetPath, false);
					switch (outcome.status) {
						case "created":
							setToast({
								kind: "success",
								text: `Workflow written to ${outcome.workflowPath}\n${ciNextSteps()
									.map((step) => `• ${step}`)
									.join("\n")}`,
							});
							break;
						case "exists":
							setToast({
								kind: "info",
								text: `${outcome.workflowPath} already exists. Use "ci install --force" to replace it.`,
							});
							break;
						case "no-repo":
							setToast({
								kind: "error",
								text: "Not a git repository; nothing was written.",
							});
							break;
						case "symlink":
							setToast({
								kind: "error",
								text: `${outcome.workflowPath} is a symlink; refusing to write through it.`,
							});
							break;
						default:
							setToast({
								kind: "error",
								text: `Could not write the workflow (${outcome.status}).`,
							});
					}
				} else if (action === "markdown") {
					const markdown = buildMarkdownReport(context.result, {
						targetPath: context.targetPath,
						version: context.version,
					});
					if (await copyToClipboard(markdown)) {
						setToast({
							kind: "success",
							text: "Markdown summary copied to the clipboard.",
						});
					} else {
						deferPrint(markdown);
						setToast({
							kind: "info",
							text: "No clipboard tool found; the summary prints when you quit.",
						});
					}
				}
			} catch (error) {
				setToast({
					kind: "error",
					text: error instanceof Error ? error.message : String(error),
				});
			} finally {
				setBusy(false);
			}
		},
		[context, deferPrint, exit]
	);

	useInput(
		(input, key) => {
			if (screen !== "score") {
				return;
			}
			if (input === "q" && !busy) {
				exit();
				return;
			}
			if (key.return && !busy) {
				// biome-ignore lint/suspicious/noEmptyBlockStatements: the action reports its own errors as a toast
				runAction(items[selectedAction].action).catch(() => {});
				return;
			}
			if (subCount > 0 && (key.leftArrow || key.rightArrow || key.tab)) {
				setScoreFocus((previous) => (previous === "menu" ? "list" : "menu"));
				return;
			}
			if (scoreFocus === "list" && subCount > 0) {
				if (key.upArrow || input === "k") {
					setSelectedSub((previous) => Math.max(0, previous - 1));
				} else if (key.downArrow || input === "j") {
					setSelectedSub((previous) => Math.min(subCount - 1, previous + 1));
				}
				return;
			}
			if (key.upArrow || input === "k") {
				setSelectedAction((previous) =>
					previous === 0 ? items.length - 1 : previous - 1
				);
			} else if (key.downArrow || input === "j") {
				setSelectedAction((previous) => (previous + 1) % items.length);
			}
		},
		{ isActive: screen === "score" }
	);

	useInput(
		(input, key) => {
			if (screen !== "handoff") {
				return;
			}
			if (key.upArrow || input === "k") {
				setSelectedHandoff((previous) =>
					previous === 0 ? handoffItems.length - 1 : previous - 1
				);
			} else if (key.downArrow || input === "j") {
				setSelectedHandoff((previous) => (previous + 1) % handoffItems.length);
			} else if (key.escape) {
				setScreen("score");
			} else if (key.return) {
				const item = handoffItems[selectedHandoff];
				if (item.kind === "back") {
					setScreen("score");
				} else if (item.kind === "copy") {
					// biome-ignore lint/suspicious/noEmptyBlockStatements: a clipboard failure prints to stderr itself
					copyHandoffPrompt().catch(() => {});
				} else if (item.agent) {
					onRequestAgent(
						item.agent,
						buildHandoffPrompt(shown.diagnostics, context.targetPath)
					);
				}
			}
		},
		{ isActive: screen === "handoff" }
	);

	if (screen === "review") {
		return (
			<ReviewScreen
				deferPrint={deferPrint}
				diagnostics={shown.diagnostics}
				onBack={() => setScreen("score")}
				onQuit={exit}
				onToast={setToast}
				targetPath={context.targetPath}
			/>
		);
	}

	if (screen === "handoff") {
		const width = Math.max(...handoffItems.map((item) => item.label.length));
		return (
			<Box
				borderColor={palette.border}
				borderStyle="single"
				flexDirection="column"
			>
				{handoffItems.map((item, index) => {
					const isSelected = index === selectedHandoff;
					return (
						<Box flexDirection="row" key={item.label}>
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
									{padEnd(item.label, width)}
								</Text>
								{item.hint ? (
									<Text color={isSelected ? palette.muted : palette.dim}>
										{item.hint}
									</Text>
								) : null}
							</Box>
						</Box>
					);
				})}
			</Box>
		);
	}

	return (
		<ScoreScreen
			busy={busy}
			context={context}
			focus={scoreFocus}
			items={items}
			result={shown}
			selected={selectedAction}
			selectedSub={selectedSub}
			toast={toast}
		/>
	);
};
