export interface SelectOption {
	label: string;
	selected?: boolean;
	value: string;
}

export interface SelectGroup {
	label: string;
	options: SelectOption[];
}

interface SelectOptions {
	groups?: SelectGroup[];
	id: string;
	indent?: number;
	options?: SelectOption[];
}

// Renders a `<select>` from flat options or labelled optgroups, each line
// indented from `indent`.
export function select({
	id,
	options = [],
	groups,
	indent = 0,
}: SelectOptions): string {
	const pad = " ".repeat(indent);
	const renderOptions = (opts: SelectOption[], depth: string) =>
		opts
			.map(
				(o) =>
					`${depth}<option value="${o.value}"${o.selected ? " selected" : ""}>${o.label}</option>`
			)
			.join("\n");
	const body = groups
		? groups
				.map((g) =>
					[
						`${pad}  <optgroup label="${g.label}">`,
						renderOptions(g.options, `${pad}    `),
						`${pad}  </optgroup>`,
					].join("\n")
				)
				.join("\n")
		: renderOptions(options, `${pad}  `);
	return [`${pad}<select id="${id}">`, body, `${pad}</select>`].join("\n");
}
