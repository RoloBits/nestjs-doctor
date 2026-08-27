export interface PillOptions {
	active?: boolean;
	label: string;
	name: string;
	value: string;
}

// Renders one filter pill. `name` is both the class prefix and the data
// attribute the click handler reads.
export function pill({ name, value, label, active }: PillOptions): string {
	const cls = active ? `${name}-pill active` : `${name}-pill`;
	return `<button class="${cls}" data-${name}="${value}">${label}</button>`;
}
