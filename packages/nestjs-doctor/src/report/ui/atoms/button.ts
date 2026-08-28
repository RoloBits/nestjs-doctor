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
