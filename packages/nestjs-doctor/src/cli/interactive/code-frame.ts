import type { SourceLine } from "../../common/diagnostic.js";
import { highlighter } from "../ui/highlighter.js";

/**
 * Renders the diagnostic's source window with the offending line marked and a
 * caret under the column. Pure ASCII.
 */
export const renderCodeFrame = (
	sourceLines: SourceLine[],
	line: number,
	column: number
): string => {
	const gutterWidth = String(
		Math.max(...sourceLines.map((entry) => entry.line))
	).length;

	const rows: string[] = [];
	for (const entry of sourceLines) {
		const isTarget = entry.line === line;
		const marker = isTarget ? ">" : " ";
		const gutter = String(entry.line).padStart(gutterWidth);
		const text =
			entry.text.length > 200 ? entry.text.slice(0, 200) : entry.text;
		const row = `${marker} ${gutter} | ${text}`;
		rows.push(isTarget ? row : highlighter.dim(row));
		if (isTarget && column > 0) {
			const caretIndent = " ".repeat(2 + gutterWidth + 3 + (column - 1));
			rows.push(highlighter.error(`${caretIndent}^`));
		}
	}
	return rows.join("\n");
};
