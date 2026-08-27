interface TextFieldOptions {
	id: string;
	indent?: number;
	label: string;
	placeholder?: string;
	value?: string;
	wide?: boolean;
}

// Pairs a label with a text input inside the Rule Lab's field wrapper.
export function textField({
	id,
	label,
	value,
	placeholder,
	wide,
	indent = 8,
}: TextFieldOptions): string {
	const pad = " ".repeat(indent);
	const cls = wide
		? "playground-field playground-field-wide"
		: "playground-field";
	const attrs = [
		`id="${id}"`,
		value === undefined ? undefined : `value="${value}"`,
		placeholder === undefined ? undefined : `placeholder="${placeholder}"`,
	]
		.filter(Boolean)
		.join(" ");
	return [
		`${pad}<div class="${cls}">`,
		`${pad}  <label for="${id}">${label}</label>`,
		`${pad}  <input type="text" ${attrs} spellcheck="false">`,
		`${pad}</div>`,
	].join("\n");
}
