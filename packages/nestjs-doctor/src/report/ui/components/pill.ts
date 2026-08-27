interface PillItem {
	active?: boolean;
	label: string;
	value: string;
}

interface PillGroupOptions {
	indent?: number;
	items: PillItem[];
	name: string;
}

// Renders one row of filter pills. `name` is both the class prefix and the
// data attribute the click handler reads.
export function pillGroup({
	name,
	items,
	indent = 10,
}: PillGroupOptions): string {
	const pad = " ".repeat(indent);
	return items
		.map(({ value, label, active }) => {
			const cls = active ? `${name}-pill active` : `${name}-pill`;
			return `${pad}<button class="${cls}" data-${name}="${value}">${label}</button>`;
		})
		.join("\n");
}
