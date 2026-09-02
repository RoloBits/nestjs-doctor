const WHITESPACE = /\s+/;

const MIN_RULE_NAME_WIDTH = 8;

export const NOT_SCORED_TAG = " · not scored";

/**
 * Splits the room left for a rule row between its name and its tag. A tag that
 * would squeeze the name below the minimum is dropped instead.
 */
export const ruleNameBudget = (
	available: number,
	tagLength: number
): { tag: boolean; width: number } =>
	tagLength > 0 && available - tagLength >= MIN_RULE_NAME_WIDTH
		? { tag: true, width: available - tagLength }
		: { tag: false, width: available };

export const truncate = (text: string, width: number): string =>
	text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

/** Wraps on spaces; anything longer than the width is truncated. */
export const wrap = (text: string, width: number): string[] => {
	if (width <= 0) {
		return [];
	}
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

/** An uppercase dim caption with the meta right-aligned, like the site's label strips. */
export const caption = (label: string, meta?: string, width = 80): string => {
	const left = label.toUpperCase();
	if (!meta) {
		return left;
	}
	if (left.length + meta.length + 1 > width) {
		return left;
	}
	const gap = Math.max(1, width - left.length - meta.length);
	return `${left}${" ".repeat(gap)}${meta}`;
};

export const padEnd = (text: string, width: number): string =>
	text.length >= width
		? truncate(text, width)
		: text + " ".repeat(width - text.length);

export const padStart = (text: string, width: number): string =>
	text.length >= width
		? truncate(text, width)
		: " ".repeat(width - text.length) + text;
