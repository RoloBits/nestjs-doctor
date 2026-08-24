import {
	type CodeDiagnostic,
	type Diagnostic,
	isCodeDiagnostic,
} from "../../../common/diagnostic.js";
import { docsUrl, locate } from "../findings.js";
import { caption, padStart, truncate, wrap } from "./text.js";
import { palette, SEVERITY_MARK, severityColor } from "./theme.js";

interface TextSpan {
	bg?: string;
	bold?: boolean;
	color?: string;
	dim?: boolean;
	text: string;
}

interface PanelLine {
	spans: TextSpan[];
}

const span = (text: string, style: Omit<TextSpan, "text"> = {}): PanelLine => ({
	spans: [{ text, ...style }],
});

const RULE_CHAR = "─";
const MAX_CODE_LINES = 9;

const ruleLine = (width: number): PanelLine =>
	span(RULE_CHAR.repeat(width), { color: palette.border });

const codeFrameLines = (
	diagnostic: CodeDiagnostic,
	width: number
): PanelLine[] => {
	const sourceLines = diagnostic.sourceLines ?? [];
	if (sourceLines.length === 0) {
		return [];
	}
	const gutterWidth = String(
		Math.max(...sourceLines.map((entry) => entry.line))
	).length;

	const rows: PanelLine[] = sourceLines.map((entry) => {
		const isTarget = entry.line === diagnostic.line;
		const marker = isTarget ? "›" : " ";
		const gutter = padStart(String(entry.line), gutterWidth);
		const body = truncate(entry.text, Math.max(0, width - gutterWidth - 5));
		return span(`${marker} ${gutter} │ ${body}`, {
			bg: isTarget ? palette.washRed : undefined,
			color: isTarget ? palette.bright : palette.muted,
			dim: !isTarget,
		});
	});

	if (rows.length > MAX_CODE_LINES) {
		const hidden = rows.length - MAX_CODE_LINES;
		return [
			...rows.slice(0, MAX_CODE_LINES),
			span(`  … ${hidden} more lines`, { color: palette.dim }),
		];
	}
	return rows;
};

const exampleLines = (
	code: string,
	mark: string,
	label: string,
	good: boolean,
	width: number
): PanelLine[] => [
	span(`${mark} ${label}`, {
		bold: true,
		color: good ? palette.success : palette.error,
	}),
	...code.split("\n").map((row) =>
		span(truncate(`  ${good ? "+" : "-"} ${row}`, width), {
			color: good ? palette.success : palette.error,
			dim: true,
		})
	),
];

/**
 * The side panel for one finding: identity, message, the code window, the
 * rule's recommendation, then the bad/good pair. Pure so the layout can be
 * sliced to fit without rendering.
 */
export const buildPanelLines = (
	diagnostic: Diagnostic,
	info: { bad?: string; description?: string; good?: string },
	width: number
): PanelLine[] => {
	const lines: PanelLine[] = [];
	const mark = SEVERITY_MARK[diagnostic.severity];
	const markColor = severityColor(diagnostic.severity);

	lines.push({
		spans: [
			{ bold: true, color: palette.bright, text: diagnostic.rule },
			{ text: "  " },
			{
				bg: markColor,
				bold: true,
				color: "#000000",
				text: ` ${diagnostic.severity.toUpperCase()} `,
			},
			{ color: markColor, text: ` ${mark}` },
		],
	});

	lines.push(
		span(`${diagnostic.category} · ${locate(diagnostic)}`, {
			color: palette.muted,
		})
	);
	lines.push(span(""));
	lines.push(span(diagnostic.message, { color: palette.text }));

	if (isCodeDiagnostic(diagnostic) && diagnostic.sourceLines?.length) {
		lines.push(span(""), ...codeFrameLines(diagnostic, width));
	}

	const url = docsUrl(diagnostic.rule);
	if (info.description) {
		lines.push(
			span(""),
			ruleLine(width),
			span(caption("Recommendation", url, width), { color: palette.muted }),
			...wrap(info.description, width).map((row) =>
				span(row, { color: palette.text })
			)
		);
	}

	if (info.bad && info.good) {
		lines.push(
			span(""),
			ruleLine(width),
			...exampleLines(info.bad, "✗", "BAD", false, width),
			span(""),
			...exampleLines(info.good, "✓", "GOOD", true, width)
		);
	}

	return lines;
};
