interface SearchInputOptions {
	id: string;
	indent?: number;
	placeholder: string;
}

// Renders one search box with the report's shared input attributes.
export function searchInput({
	id,
	placeholder,
	indent = 8,
}: SearchInputOptions): string {
	const pad = " ".repeat(indent);
	return `${pad}<input type="search" id="${id}" placeholder="${placeholder}" spellcheck="false" autocomplete="off">`;
}
