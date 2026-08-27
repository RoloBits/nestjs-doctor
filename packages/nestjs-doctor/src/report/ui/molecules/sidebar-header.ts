interface SidebarHeaderOptions {
	classes?: string;
	countId: string;
	indent?: number;
	title: string;
	titleId?: string;
	toolbar?: string;
}

// A sidebar's header row: title, entity count, spacer, and the optional
// toolbar cluster after them.
export function sidebarHeader({
	title,
	titleId,
	countId,
	toolbar,
	classes = "schema-sidebar-header",
	indent = 6,
}: SidebarHeaderOptions): string {
	const pad = " ".repeat(indent);
	const titleAttr = titleId ? ` id="${titleId}"` : "";
	const lines = [
		`${pad}<div class="${classes}">`,
		`${pad}  <span class="schema-sidebar-title"${titleAttr}>${title}</span>`,
		`${pad}  <span class="schema-entity-count" id="${countId}"></span>`,
		`${pad}  <span style="flex:1"></span>`,
	];
	if (toolbar) {
		lines.push(toolbar);
	}
	lines.push(`${pad}</div>`);
	return lines.join("\n");
}
