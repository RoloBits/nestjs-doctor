import { type SelectOption, select } from "../atoms/select.js";

interface SelectFieldOptions {
	id: string;
	indent?: number;
	label: string;
	options: SelectOption[];
}

// Pairs a label with a select inside the Rule Lab's field wrapper.
export function selectField({
	id,
	label,
	options,
	indent = 8,
}: SelectFieldOptions): string {
	const pad = " ".repeat(indent);
	return [
		`${pad}<div class="playground-field">`,
		`${pad}  <label for="${id}">${label}</label>`,
		select({ id, options, indent: indent + 2 }),
		`${pad}</div>`,
	].join("\n");
}
