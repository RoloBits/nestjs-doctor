import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type { ReportArtifact } from "../../../common/artifact.js";
import type { DiagnoseResult } from "../../../common/result.js";
import type { ShareSection } from "../../../common/share.js";
import {
	buildSharedReport,
	enumerateShareSections,
	type ShareSectionId,
	writeSharedReportFile,
} from "../../../report/share.js";
import { truncate } from "./text.js";
import { palette } from "./theme.js";
import type { Toast } from "./types.js";

interface ShareScreenProps {
	moduleGraph: () => ReportArtifact["graph"];
	onBack: () => void;
	onToast: (toast: Toast) => void;
	result: DiagnoseResult;
	targetPath: string;
	version: string;
}

interface ShareRow {
	checked: boolean;
	kind: "code" | "section";
	label: string;
	section?: ShareSection;
}

export const ShareScreen = ({
	moduleGraph,
	onBack,
	onToast,
	result,
	targetPath,
	version,
}: ShareScreenProps): React.JSX.Element => {
	const sections = useMemo(() => enumerateShareSections(result), [result]);
	const [rows, setRows] = useState<ShareRow[]>(() => [
		...sections.map((section) => ({
			checked: true,
			kind: "section" as const,
			label: `${section.label} (${section.count})`,
			section,
		})),
		{ checked: false, kind: "code", label: "Include code snippets" },
	]);
	const [selected, setSelected] = useState(0);
	const [busy, setBusy] = useState(false);

	const toggle = (index: number): void => {
		setRows((previous) =>
			previous.map((row, at) =>
				at === index ? { ...row, checked: !row.checked } : row
			)
		);
	};

	const save = async (): Promise<void> => {
		if (busy) {
			return;
		}
		const picked = rows.flatMap((row) =>
			row.checked && row.section ? [row.section.id as ShareSectionId] : []
		);
		if (picked.length === 0) {
			onToast({ kind: "error", text: "Pick at least one section." });
			return;
		}
		setBusy(true);
		try {
			const includeCode =
				rows.find((row) => row.kind === "code")?.checked ?? false;
			const shared = buildSharedReport(
				result,
				{ includeCode, sections: picked },
				version,
				targetPath,
				picked.includes("modules") ? moduleGraph() : undefined
			);
			if (!shared) {
				onToast({
					kind: "error",
					text: "Nothing was shareable in those sections.",
				});
				return;
			}
			const outPath = await writeSharedReportFile(targetPath, shared);
			onToast({
				kind: "success",
				text: `Shared report written to ${outPath}`,
			});
			onBack();
		} catch (error) {
			onToast({
				kind: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	useInput(
		(input, key) => {
			if (key.upArrow || input === "k") {
				setSelected((previous) =>
					previous === 0 ? rows.length - 1 : previous - 1
				);
			} else if (key.downArrow || input === "j") {
				setSelected((previous) => (previous + 1) % rows.length);
			} else if (input === " ") {
				toggle(selected);
			} else if (input === "c") {
				const index = rows.findIndex((row) => row.kind === "code");
				if (index >= 0) {
					toggle(index);
					setSelected(index);
				}
			} else if (key.escape) {
				onBack();
			} else if (key.return) {
				// biome-ignore lint/suspicious/noEmptyBlockStatements: save reports its own errors as a toast
				save().catch(() => {});
			}
		},
		{ isActive: true }
	);

	return (
		<Box
			borderColor={palette.border}
			borderStyle="single"
			flexDirection="column"
		>
			<Text bold color={palette.bright}>
				{" SHARE THE REPORT"}
			</Text>
			{rows.map((row, index) => {
				const isSelected = index === selected;
				return (
					<Box flexDirection="row" key={row.label}>
						<Box
							backgroundColor={isSelected ? palette.nestRed : undefined}
							width={1}
						>
							<Text> </Text>
						</Box>
						<Box
							backgroundColor={isSelected ? palette.washRed : undefined}
							flexDirection="row"
							gap={2}
							paddingLeft={1}
						>
							<Text color={isSelected ? palette.bright : palette.text}>
								{`[${row.checked ? "x" : " "}] ${truncate(row.label, 64)}`}
							</Text>
							{row.kind === "code" ? (
								<Text color={isSelected ? palette.muted : palette.dim}>
									{"a few lines around each finding"}
								</Text>
							) : null}
						</Box>
					</Box>
				);
			})}
			<Text color={palette.dim}>
				{`${targetPath}/nestjs-doctor-shared.json`}
			</Text>
			<Text color={palette.dim}>
				{"↑↓ select · space toggle · c code · enter save · esc back"}
			</Text>
		</Box>
	);
};
