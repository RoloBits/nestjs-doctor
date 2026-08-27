export interface SelectOption {
	label: string;
	selected?: boolean;
	value: string;
}

interface SelectOptions {
	id: string;
	indent?: number;
	options: SelectOption[];
}

// Renders a `<select>` and its options, each line indented from `indent`.
export function select({ id, options, indent = 0 }: SelectOptions): string {
	const pad = " ".repeat(indent);
	const rendered = options
		.map(
			(o) =>
				`${pad}  <option value="${o.value}"${o.selected ? " selected" : ""}>${o.label}</option>`
		)
		.join("\n");
	return [`${pad}<select id="${id}">`, rendered, `${pad}</select>`].join("\n");
}
