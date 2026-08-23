import { highlighter } from "../ui/highlighter.js";

const WHITESPACE = /\s+/;
const MIN_WIDTH = 40;
const MAX_WIDTH = 96;
const GUTTER = 4;

const unicode = process.platform !== "win32" || Boolean(process.env.WT_SESSION);
const MARK_BAD = unicode ? "✗" : "[x]";
const MARK_GOOD = unicode ? "✓" : "[v]";
const RULE = unicode ? "─" : "-";

/** Usable width for panel text, clamped so long lines never wrap the frame. */
const bodyWidth = (columns = process.stdout.columns || 80): number =>
	Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, columns - GUTTER));

const truncate = (text: string, width: number): string =>
	text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

/** Wraps on spaces, leaving anything longer than the width to be truncated. */
const wrap = (text: string, width: number): string[] => {
	const out: string[] = [];
	let line = "";
	for (const word of text.split(WHITESPACE)) {
		if (line && `${line} ${word}`.length > width) {
			out.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) {
		out.push(line);
	}
	return out.map((row) => truncate(row, width));
};

/** An uppercase dim caption, the terminal form of the site's label strip. */
const caption = (label: string, meta?: string, width = bodyWidth()): string => {
	const left = label.toUpperCase();
	if (!meta) {
		return highlighter.dim(left);
	}
	const gap = Math.max(1, width - left.length - meta.length);
	return highlighter.dim(`${left}${" ".repeat(gap)}${meta}`);
};

const sample = (
	code: string,
	mark: string,
	label: string,
	sigil: string,
	paint: (text: string) => string,
	width: number
): string[] => [
	paint(`${mark} ${label}`),
	...code.split("\n").map((row) => `  ${sigil} ${truncate(row, width - 4)}`),
];

/**
 * The rule's guidance below a finding: what it means, then the sample pair.
 * Bad and Good are marked three ways over, so the distinction survives with
 * no colour at all.
 */
export const renderRulePanel = (
	info: { bad?: string; description?: string; good?: string },
	docsUrl?: string,
	columns?: number
): string[] => {
	const width = bodyWidth(columns);
	const lines: string[] = [];

	if (info.description) {
		lines.push(
			highlighter.dim(RULE.repeat(width)),
			caption("Recommendation", docsUrl, width),
			...wrap(info.description, width)
		);
	}

	if (info.bad && info.good) {
		lines.push(
			highlighter.dim(RULE.repeat(width)),
			...sample(info.bad, MARK_BAD, "BAD", "-", highlighter.error, width),
			"",
			...sample(info.good, MARK_GOOD, "GOOD", "+", highlighter.success, width)
		);
	}

	return lines;
};
