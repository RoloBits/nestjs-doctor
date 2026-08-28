const TAB_IDS = [
	"tab-summary",
	"tab-diagnosis",
	"tab-lab",
	"tab-schema",
	"tab-endpoints",
	"tab-modules",
];

// The emitted body: two header containers and one mount point per tab,
// in DOM order. The summary starts active; everything is filled by React.
export function getReportHtml(): string {
	const tabs = TAB_IDS.map(
		(id) =>
			`\n<div class="tab-content${id === "tab-summary" ? " active" : ""}" id="${id}"></div>`
	).join("");
	return `\n<div id="header-row1"></div>\n<div id="header-row2"></div>${tabs}\n`;
}
