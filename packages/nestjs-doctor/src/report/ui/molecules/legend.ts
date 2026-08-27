import { type LegendItemOptions, legendItem } from "../atoms/legend-item.js";

// Renders the modules-graph legend rows.
export function legend(items: LegendItemOptions[], indent = 2): string {
	const pad = " ".repeat(indent);
	return items.map((item) => pad + legendItem(item)).join("\n");
}
