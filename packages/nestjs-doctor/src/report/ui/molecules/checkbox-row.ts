interface CheckboxRowOptions {
	checked?: boolean;
	id: string;
	indent?: number;
	label: string;
	rowId?: string;
	tip?: string;
}

// A `schema-sync` label wrapping a checkbox and its caption. `tip` adds the
// has-tip class the floating tooltip binds to.
export function checkboxRow({
	id,
	label,
	checked,
	tip,
	rowId,
	indent = 6,
}: CheckboxRowOptions): string {
	const pad = " ".repeat(indent);
	const attrs = [
		`class="schema-sync${tip ? " has-tip" : ""}"`,
		rowId ? `id="${rowId}"` : undefined,
		tip ? `data-tip="${tip}"` : undefined,
	].filter(Boolean);
	return [
		`${pad}<label ${attrs.join(" ")}>`,
		`${pad}  <input type="checkbox" id="${id}"${checked ? " checked" : ""}>`,
		`${pad}  <span>${label}</span>`,
		`${pad}</label>`,
	].join("\n");
}
