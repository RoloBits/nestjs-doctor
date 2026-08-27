interface HeadingOptions {
	classes?: string;
	id?: string;
	indent?: number;
	level: 1 | 2 | 3 | 4 | 5 | 6;
	style?: string;
	text?: string;
	tip?: string;
}

// Renders one heading. `text` is inner HTML the caller has already escaped;
// `tip` adds the has-tip class the floating tooltip binds to.
export function heading({
	level,
	text = "",
	id,
	classes,
	style,
	tip,
	indent = 0,
}: HeadingOptions): string {
	const cls = [classes, tip ? "has-tip" : undefined].filter(Boolean).join(" ");
	const attrs = [
		cls ? ` class="${cls}"` : "",
		id ? ` id="${id}"` : "",
		style ? ` style="${style}"` : "",
		tip ? ` data-tip="${tip}"` : "",
	].join("");
	const pad = " ".repeat(indent);
	return `${pad}<h${level}${attrs}>${text}</h${level}>`;
}
