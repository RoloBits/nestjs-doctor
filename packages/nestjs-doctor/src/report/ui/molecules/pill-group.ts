import { type PillOptions, pill } from "../atoms/pill.js";

interface PillGroupOptions {
	indent?: number;
	items: Omit<PillOptions, "name">[];
	name: string;
}

// Renders one row of filter pills sharing a name.
export function pillGroup({
	name,
	items,
	indent = 10,
}: PillGroupOptions): string {
	const pad = " ".repeat(indent);
	return items.map((item) => pad + pill({ name, ...item })).join("\n");
}
