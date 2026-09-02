import { Box, Text, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Diagnostic } from "../../../common/diagnostic.js";
import { openReportInBrowser } from "../../../report/output.js";
import { usableColumns, usableRows } from "../../../ui/terminal.js";
import { copyToClipboard } from "../clipboard.js";
import { buildFixPrompt, docsUrl, groupFindings } from "../findings.js";
import { ruleInfo } from "../rule-info.js";
import {
	buildListRows,
	flattenFindings,
	moveSelection,
	scrollWindow,
} from "./navigate.js";
import { buildPanelLines } from "./panel.js";
import { truncate } from "./text.js";
import { palette, SEVERITY_MARK, severityColor } from "./theme.js";
import type { Toast } from "./types.js";

const MIN_VISIBLE_ROWS = 8;
const CHROME_ROWS = 7;
const NOT_SCORED_TAG = " · not scored";
const MIN_RULE_NAME_WIDTH = 8;

interface ReviewScreenProps {
	deferPrint: (text: string) => void;
	diagnostics: Diagnostic[];
	onBack: () => void;
	onQuit: () => void;
	onToast: (toast: Toast) => void;
	targetPath: string;
}

const shortRule = (rule: string): string =>
	rule.split("/").slice(1).join("/") || rule;

export const ReviewScreen = ({
	diagnostics,
	deferPrint,
	onBack,
	onQuit,
	onToast,
	targetPath,
}: ReviewScreenProps): React.JSX.Element => {
	const { stdout } = useStdout();
	const columns = usableColumns(stdout.columns);
	const visibleRows = Math.max(
		MIN_VISIBLE_ROWS,
		usableRows(stdout.rows) - CHROME_ROWS
	);

	const groups = useMemo(() => groupFindings(diagnostics), [diagnostics]);
	const flat = useMemo(() => flattenFindings(groups), [groups]);
	const listRows = useMemo(() => buildListRows(groups), [groups]);

	const [selected, setSelected] = useState(0);
	const [offset, setOffset] = useState(0);
	const [panelOffset, setPanelOffset] = useState(0);

	const safeSelected = Math.min(selected, Math.max(0, flat.length - 1));
	const current = flat[safeSelected];
	const group = current ? groups[current.groupIndex] : undefined;
	const diagnostic = group?.diagnostics[current.position];

	const leftContent = Math.max(14, Math.min(42, Math.round(columns * 0.34)));
	const leftWidth = leftContent + 1;
	const panelInner = Math.max(12, columns - leftWidth - 5);

	const panelLines = useMemo(() => {
		if (!diagnostic) {
			return [];
		}
		return buildPanelLines(diagnostic, ruleInfo(diagnostic.rule), panelInner);
	}, [diagnostic, panelInner]);

	const selectedRowIndex = current
		? listRows.findIndex(
				(row) => row.kind === "group" && row.groupIndex === current.groupIndex
			)
		: -1;

	useEffect(() => {
		setOffset((previous) =>
			scrollWindow(previous, selectedRowIndex, visibleRows)
		);
	}, [selectedRowIndex, visibleRows]);

	const move = useCallback(
		(delta: Parameters<typeof moveSelection>[2]) => {
			setSelected((previous) =>
				moveSelection(flat, Math.min(previous, flat.length - 1), delta)
			);
			setPanelOffset(0);
		},
		[flat]
	);

	const copyPrompt = useCallback(async () => {
		if (!group) {
			return;
		}
		const prompt = buildFixPrompt(group, targetPath);
		if (await copyToClipboard(prompt)) {
			onToast({
				kind: "success",
				text: "Fix prompt copied. Paste it into any agent.",
			});
			return;
		}
		deferPrint(prompt);
		onToast({
			kind: "info",
			text: "No clipboard tool found; the prompt prints when you quit.",
		});
	}, [deferPrint, group, onToast, targetPath]);

	const openDocs = useCallback(() => {
		if (!diagnostic) {
			return;
		}
		const url = docsUrl(diagnostic.rule);
		if (!url) {
			onToast({ kind: "error", text: "Custom rules have no docs page." });
			return;
		}
		openReportInBrowser(url, (message) => {
			onToast({ kind: "error", text: message });
		});
		onToast({ kind: "info", text: `Opening ${url}` });
	}, [diagnostic, onToast]);

	const panelMaxOffset = Math.max(0, panelLines.length - visibleRows);
	const panelOverflows = panelLines.length > visibleRows;
	const panelRoom = panelOverflows ? visibleRows - 1 : visibleRows;
	const safePanelOffset = Math.min(panelOffset, panelMaxOffset);

	useInput((input, key) => {
		if (key.upArrow || input === "k") {
			move(-1);
		} else if (key.downArrow || input === "j") {
			move(1);
		} else if (key.leftArrow || input === "h") {
			move("group-prev");
		} else if (key.rightArrow || input === "l" || key.tab) {
			move("group-next");
		} else if (input === "g") {
			setSelected(0);
			setPanelOffset(0);
		} else if (input === "G") {
			setSelected(Math.max(0, flat.length - 1));
			setPanelOffset(0);
		} else if (input === ",") {
			setPanelOffset((previous) => Math.max(0, previous - 1));
		} else if (input === ".") {
			setPanelOffset((previous) => Math.min(panelMaxOffset, previous + 1));
		} else if (input === "c") {
			// biome-ignore lint/suspicious/noEmptyBlockStatements: a clipboard failure defers its own print
			copyPrompt().catch(() => {});
		} else if (input === "o") {
			openDocs();
		} else if (input === "b" || key.escape) {
			onBack();
		} else if (input === "q") {
			onQuit();
		}
	});

	const visibleSlice = listRows.slice(offset, offset + visibleRows);
	const shownPanel = panelLines.slice(
		safePanelOffset,
		safePanelOffset + panelRoom
	);

	return (
		<Box flexDirection="column" gap={1}>
			<Box borderColor={palette.border} borderStyle="single">
				<Box flexDirection="column" flexShrink={0} width={leftWidth}>
					{visibleSlice.map((row) => {
						if (row.kind === "category") {
							return (
								<Text color={palette.muted} key={row.label}>
									{` ${truncate(row.label.toUpperCase(), leftContent - 1)}`}
								</Text>
							);
						}
						const entry = groups[row.groupIndex];
						const isSelected =
							current !== undefined && row.groupIndex === current.groupIndex;
						const count = entry.diagnostics.length;
						const suffix = count > 1 ? ` (${count})` : "";
						// The tag keeps its full width; the rule name gives way to it.
						const tag = entry.scored ? "" : NOT_SCORED_TAG;
						const name = truncate(
							`${shortRule(entry.rule)}${suffix}`,
							Math.max(MIN_RULE_NAME_WIDTH, leftContent - 3 - tag.length)
						);
						return (
							<Box flexDirection="row" key={entry.rule}>
								<Box
									backgroundColor={isSelected ? palette.nestRed : undefined}
									width={1}
								>
									<Text> </Text>
								</Box>
								<Box
									backgroundColor={isSelected ? palette.washRed : undefined}
									width={leftContent}
								>
									<Text>
										<Text color={severityColor(entry.severity)}>
											{` ${SEVERITY_MARK[entry.severity]} `}
										</Text>
										<Text
											bold={isSelected}
											color={isSelected ? palette.bright : palette.text}
										>
											{name}
										</Text>
										{tag ? <Text color={palette.dim}>{tag}</Text> : null}
									</Text>
								</Box>
							</Box>
						);
					})}
					{listRows.length === 0 ? (
						<Text color={palette.dim}> No findings </Text>
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
				<Box
					flexDirection="column"
					paddingLeft={1}
					paddingRight={1}
					width={panelInner + 2}
				>
					{shownPanel.map((line, index) => (
						<Text key={index}>
							{line.spans.map((part, partIndex) => (
								<Text
									backgroundColor={part.bg}
									bold={part.bold}
									color={part.color}
									dimColor={part.dim}
									key={partIndex}
								>
									{part.text}
								</Text>
							))}
						</Text>
					))}
					{panelOverflows ? (
						<Text color={palette.dim}>
							{`… ${safePanelOffset + 1}-${Math.min(panelLines.length, safePanelOffset + panelRoom)} of ${panelLines.length} · ,. scroll`}
						</Text>
					) : null}
				</Box>
			</Box>
			<Text color={palette.dim}>
				{truncate(
					` ${safeSelected + 1}/${flat.length} · ↑↓ finding · ←→ rule · g/G ends · ,. panel · c copy prompt · o docs · b back · q quit`,
					Math.max(20, columns - 1)
				)}
			</Text>
		</Box>
	);
};
