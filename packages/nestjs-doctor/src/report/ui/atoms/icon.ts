// Inline SVG bodies for the report's icon buttons, indented at column 0.
export const ICONS = {
	expandAll: `<svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
  <path d="M11 5l2.5 3L16 5"/>
</svg>`,

	collapseAll: `<svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
  <path d="M11 11l2.5-3L16 11"/>
</svg>`,

	recenter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
</svg>`,

	sidebarCollapse: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 3 4 8 9 13"/><line x1="13" y1="3" x2="13" y2="13"/>
</svg>`,

	sidebarShow: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="7 3 12 8 7 13"/><line x1="3" y1="3" x2="3" y2="13"/>
</svg>`,

	zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,

	zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,

	info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
</svg>`,

	toggleView: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
</svg>`,

	expandTables: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
</svg>`,

	minimizeTables: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
</svg>`,

	toggleColumns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/>
  <line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/>
</svg>`,

	pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
</svg>`,

	activity: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
</svg>`,

	fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>`,

	file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,

	folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,

	caretUp: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8l1.5 1.5L8 3l6.5 6.5L16 8 8 0z"/></svg>`,

	caretDown: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8l1.5-1.5L8 13l6.5-6.5L16 8 8 16z"/></svg>`,

	chevronSmall: `<svg viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

	infoDot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,

	filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,

	box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,

	checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--score-green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,

	controller: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--nest-red)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="10" x2="9" y2="10"/></svg>`,

	schemaTable: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--white)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="6" y1="5.5" x2="6" y2="14"/></svg>`,

	schemaTableOpen: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--white)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="1.5"/><rect x="2" y="2" width="12" height="3.5" rx="1.5" fill="var(--white)" opacity="0.35"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="6" y1="5.5" x2="6" y2="14"/></svg>`,

	schemaFolder: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.2"><path d="M2 4.5h4l1.5-1.5H14v10H2z"/></svg>`,

	schemaFolderOpen: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.2"><path d="M2 4.5h4l1.5-1.5H14v2H4L2 13V4.5z"/><path d="M4 7h11l-2 6H2z"/></svg>`,

	schemaKey: `<svg viewBox="0 0 16 16" fill="none" stroke="#ea2845" stroke-width="1.3"><circle cx="5.5" cy="6.5" r="2.5"/><line x1="8" y1="6.5" x2="14" y2="6.5"/><line x1="12" y1="6.5" x2="12" y2="9"/><line x1="14" y1="6.5" x2="14" y2="9"/></svg>`,

	schemaColumn: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-dim)" stroke-width="1.2"><rect x="4" y="3" width="8" height="10" rx="1"/><line x1="6" y1="6" x2="10" y2="6"/><line x1="6" y1="8.5" x2="10" y2="8.5"/></svg>`,

	schemaFk: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--cat-architecture)" stroke-width="1.2"><circle cx="5" cy="8" r="2.5"/><line x1="7.5" y1="8" x2="14" y2="8"/><polyline points="11,5.5 14,8 11,10.5"/></svg>`,

	schemaIndex: `<svg viewBox="0 0 16 16" fill="none" stroke="var(--cat-performance)" stroke-width="1.2"><line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="8" x2="10" y2="8"/><line x1="3" y1="12" x2="7" y2="12"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

const STROKE_ATTR = /stroke="[^"]*"/;
const STROKE_WIDTH_ATTR = /stroke-width="[^"]*"/;

export interface IconOptions {
	ariaHidden?: boolean;
	classes?: string;
	id?: string;
	indent?: number;
	name: IconName;
	size?: number;
	stroke?: string;
	strokeWidth?: string;
}

// Renders one named icon, splicing the optional attributes into the stored
// tag and indenting every line by `indent`.
export function icon({
	name,
	size,
	stroke,
	strokeWidth,
	classes,
	id,
	ariaHidden,
	indent = 0,
}: IconOptions): string {
	let svg: string = ICONS[name];
	const inserted = [
		classes ? `class="${classes}"` : undefined,
		id ? `id="${id}"` : undefined,
		size === undefined ? undefined : `width="${size}" height="${size}"`,
	]
		.filter(Boolean)
		.join(" ");
	if (inserted) {
		svg = svg.replace("<svg ", `<svg ${inserted} `);
	}
	if (stroke) {
		svg = svg.replace(STROKE_ATTR, `stroke="${stroke}"`);
	}
	if (strokeWidth) {
		svg = svg.replace(STROKE_WIDTH_ATTR, `stroke-width="${strokeWidth}"`);
	}
	if (ariaHidden) {
		svg = svg.replace(">", ' aria-hidden="true">');
	}
	const pad = " ".repeat(indent);
	return svg
		.split("\n")
		.map((line) => (line ? pad + line : line))
		.join("\n");
}
