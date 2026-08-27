import { searchInput } from "../atoms/search-input.js";

interface SearchFieldOptions {
	id: string;
	indent?: number;
	placeholder: string;
}

// A sidebar search box inside its `mg-side-search` wrapper.
export function searchField({
	id,
	placeholder,
	indent = 6,
}: SearchFieldOptions): string {
	const pad = " ".repeat(indent);
	return [
		`${pad}<div class="mg-side-search">`,
		searchInput({ id, placeholder, indent: indent + 2 }),
		`${pad}</div>`,
	].join("\n");
}
