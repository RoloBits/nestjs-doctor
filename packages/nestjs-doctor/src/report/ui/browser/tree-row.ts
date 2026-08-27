interface TreeRowOptions {
	/** Markup between the toggle and the label, in place of an icon. */
	before?: string;
	classes?: string;
	dataAttrs?: string;
	depth: number;
	/** Trailing markup, typically a count badge. */
	extra?: string;
	icon?: string;
	/** Already escaped by the caller. */
	iconTip?: string;
	label: string;
	toggleGlyph?: string;
	toggleId?: string;
}

const INDENT = '<span class="st-indent"></span>';

// One row of a sidebar tree. Shared by the schema, modules and endpoints
// panels, which differ only in which slots they fill.
export function treeRow({
	depth,
	label,
	toggleId,
	toggleGlyph = "▸",
	icon,
	iconTip,
	before,
	extra,
	classes,
	dataAttrs,
}: TreeRowOptions): string {
	let h = `<div class="st-row${classes ? ` ${classes}` : ""}"${dataAttrs || ""}>`;
	h += INDENT.repeat(depth);
	h += toggleId
		? `<span class="st-toggle" data-toggle="${toggleId}">${toggleGlyph}</span>`
		: INDENT;
	if (icon) {
		h += iconTip
			? `<span class="st-icon has-tip" data-tip="${iconTip}">${icon}</span>`
			: `<span class="st-icon">${icon}</span>`;
	}
	if (before) {
		h += before;
	}
	h += `<span class="st-label">${label}</span>`;
	if (extra) {
		h += extra;
	}
	return `${h}</div>`;
}
