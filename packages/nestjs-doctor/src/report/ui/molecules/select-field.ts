import {
	type SelectGroup,
	type SelectOption,
	select,
} from "../atoms/select.js";

interface SelectFieldOptions {
	groups?: SelectGroup[];
	id: string;
	indent?: number;
	label: string;
	options?: SelectOption[];
	wide?: boolean;
}

// Pairs a label with a select inside the Rule Lab's field wrapper.
export function selectField({
	id,
	label,
	options,
	groups,
	wide,
	indent = 8,
}: SelectFieldOptions): string {
	const pad = " ".repeat(indent);
	const cls = wide
		? "playground-field playground-field-wide"
		: "playground-field";
	return [
		`${pad}<div class="${cls}">`,
		`${pad}  <label for="${id}">${label}</label>`,
		select({ id, options, groups, indent: indent + 2 }),
		`${pad}</div>`,
	].join("\n");
}
