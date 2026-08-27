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

interface TextButtonOptions {
	ariaExpanded?: boolean;
	ariaLabel?: string;
	classes?: string;
	content?: string;
	id: string;
	indent?: number;
	label?: string;
	tip?: string;
	type?: string;
}

// Renders one text button. `label` is inline content; `content` is multi-line
// inner HTML emitted on its own lines. `tip` adds the has-tip class.
export function textButton({
	id,
	label = "",
	content,
	classes,
	type,
	ariaLabel,
	ariaExpanded,
	tip,
	indent = 6,
}: TextButtonOptions): string {
	const cls = [classes, tip ? "has-tip" : undefined].filter(Boolean).join(" ");
	const attrs = [
		cls ? `class="${cls}"` : undefined,
		`id="${id}"`,
		type ? `type="${type}"` : undefined,
		ariaLabel ? `aria-label="${ariaLabel}"` : undefined,
		ariaExpanded === undefined ? undefined : `aria-expanded="${ariaExpanded}"`,
		tip ? `data-tip="${tip}"` : undefined,
	].filter(Boolean);
	const pad = " ".repeat(indent);
	if (content === undefined) {
		return `${pad}<button ${attrs.join(" ")}>${label}</button>`;
	}
	return `${pad}<button ${attrs.join(" ")}>\n${content}\n${pad}</button>`;
}

// A dismiss button: the same text button, always rendering the times glyph.
export function closeButton(
	options: Omit<TextButtonOptions, "content" | "label">
): string {
	return textButton({ ...options, label: "&times;" });
}
