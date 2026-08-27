export interface LegendItemOptions {
	hidden?: boolean;
	id?: string;
	kind: "color" | "line";
	label: string;
	style: string;
}

// Renders one legend row. `kind` picks the swatch shape and `style` carries
// the colours that swatch is demonstrating.
export function legendItem({
	kind,
	style,
	label,
	id,
	hidden,
}: LegendItemOptions): string {
	const attrs = [
		'class="legend-item"',
		id ? `id="${id}"` : undefined,
		hidden ? 'style="display:none"' : undefined,
	].filter(Boolean);
	return `<div ${attrs.join(" ")}><div class="legend-${kind}" style="${style}"></div> ${label}</div>`;
}
