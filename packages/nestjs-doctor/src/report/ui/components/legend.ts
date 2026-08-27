interface LegendItem {
	hidden?: boolean;
	id?: string;
	kind: "color" | "line";
	label: string;
	style: string;
}

// Renders the modules-graph legend rows. `kind` picks the swatch shape and
// `style` carries the colours that swatch is demonstrating.
export function legend(items: LegendItem[], indent = 2): string {
	const pad = " ".repeat(indent);
	return items
		.map(({ kind, style, label, id, hidden }) => {
			const outer = [
				'class="legend-item"',
				id ? `id="${id}"` : undefined,
				hidden ? 'style="display:none"' : undefined,
			].filter(Boolean);
			return `${pad}<div ${outer.join(" ")}><div class="legend-${kind}" style="${style}"></div> ${label}</div>`;
		})
		.join("\n");
}
