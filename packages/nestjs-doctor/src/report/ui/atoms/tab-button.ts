interface TabButtonOptions {
	active?: boolean;
	after?: string;
	hidden?: boolean;
	id?: string;
	label: string;
	paths: string;
	tab: string;
}

const TAB_ICON =
	'class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

// Renders one tab-bar button. `after` carries the count or beta badge that
// follows the label on some tabs.
export function tabButton({
	tab,
	label,
	paths,
	active,
	id,
	hidden,
	after = "",
}: TabButtonOptions): string {
	const attrs = [
		`class="${active ? "tab-btn active" : "tab-btn"}"`,
		`data-tab="${tab}"`,
		id ? `id="${id}"` : undefined,
		hidden ? 'style="display:none"' : undefined,
	].filter(Boolean);
	return `  <button ${attrs.join(" ")}><svg ${TAB_ICON}>${paths}</svg>${label}${after}</button>`;
}
