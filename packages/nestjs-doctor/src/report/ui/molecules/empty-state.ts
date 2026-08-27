import { type IconOptions, icon } from "../atoms/icon.js";

interface EmptyStateOptions {
	classes?: string;
	extra?: string;
	icon: Omit<IconOptions, "indent">;
	id?: string;
	indent?: number;
	text: string;
}

// An empty-state panel: an icon over a one-line message, with an optional
// trailing element.
export function emptyState({
	id,
	classes,
	icon: iconOptions,
	text,
	extra,
	indent = 4,
}: EmptyStateOptions): string {
	const pad = " ".repeat(indent);
	const attrs = [
		id ? ` id="${id}"` : "",
		classes ? ` class="${classes}"` : "",
	].join("");
	const lines = [
		`${pad}<div${attrs}>`,
		icon({ ...iconOptions, indent: indent + 2 }),
		`${pad}  <p>${text}</p>`,
	];
	if (extra) {
		lines.push(`${pad}  ${extra}`);
	}
	lines.push(`${pad}</div>`);
	return lines.join("\n");
}
