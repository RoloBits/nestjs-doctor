interface BadgeOptions {
	classes?: string;
	id?: string;
	style?: string;
	text: string;
	tip?: string;
	title?: string;
	variant?: string;
}

// A pill in the module detail panel. `variant` picks the colour class and
// `classes` carries the tooltip helpers some badges add.
export function badge({
	text,
	variant,
	classes,
	id,
	style,
	title,
	tip,
}: BadgeOptions): string {
	const cls = ["md-badge", variant, classes].filter(Boolean).join(" ");
	const attrs = [
		`class="${cls}"`,
		id ? `id="${id}"` : undefined,
		style ? `style="${style}"` : undefined,
		title ? `title="${title}"` : undefined,
		tip ? `data-tip="${tip}"` : undefined,
	].filter(Boolean);
	return `<span ${attrs.join(" ")}>${text}</span>`;
}
