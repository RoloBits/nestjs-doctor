interface SelectOption {
	label: string;
	selected?: boolean;
	value: string;
}

interface SelectFieldOptions {
	id: string;
	indent?: number;
	label: string;
	options: SelectOption[];
}

// Renders a labelled `<select>` row in the Rule Lab form.
export function selectField({
	id,
	label,
	options,
	indent = 8,
}: SelectFieldOptions): string {
	const pad = " ".repeat(indent);
	const rendered = options
		.map(
			(o) =>
				`${pad}    <option value="${o.value}"${o.selected ? " selected" : ""}>${o.label}</option>`
		)
		.join("\n");
	return [
		`${pad}<div class="playground-field">`,
		`${pad}  <label for="${id}">${label}</label>`,
		`${pad}  <select id="${id}">`,
		rendered,
		`${pad}  </select>`,
		`${pad}</div>`,
	].join("\n");
}
