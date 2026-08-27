import { ICONS, type IconName } from "./icon.js";

interface IconButtonOptions {
	ariaLabel?: string;
	icon: IconName;
	id: string;
	indent?: number;
	modifier?: string;
	tip?: string;
	title?: string;
}

// Renders one `st-btn` icon button. `tip` adds the has-tip class the floating
// tooltip binds to.
export function iconButton({
	id,
	icon,
	modifier,
	ariaLabel,
	tip,
	title,
	indent = 8,
}: IconButtonOptions): string {
	const classes = ["st-btn", modifier, tip ? "has-tip" : undefined].filter(
		Boolean
	);
	const attrs = [
		`id="${id}"`,
		ariaLabel ? `aria-label="${ariaLabel}"` : undefined,
		tip ? `data-tip="${tip}"` : undefined,
		title ? `title="${title}"` : undefined,
	].filter(Boolean);
	const pad = " ".repeat(indent);
	const glyph = ICONS[icon]
		.split("\n")
		.map((line) => (line ? `${pad}  ${line}` : line))
		.join("\n");
	return `${pad}<button class="${classes.join(" ")}" ${attrs.join(" ")}>\n${glyph}\n${pad}</button>`;
}
