import { textButton } from "../atoms/button.js";
import { icon } from "../atoms/icon.js";
import { checkboxRow } from "../molecules/checkbox-row.js";
import { emptyState } from "../molecules/empty-state.js";
import { pillGroup } from "../molecules/pill-group.js";
import { searchField } from "../molecules/search-field.js";
import { sidebarHeader } from "../molecules/sidebar-header.js";
import { treeToolbar } from "../molecules/tree-toolbar.js";

export const TAB_DIAGNOSIS = `
<!-- ── Tab: Diagnosis ── -->
<div class="tab-content" id="tab-diagnosis">
  <div id="diagnosis-sidebar">
    <div class="diagnosis-toolbar">
${sidebarHeader({
	title: "Files",
	countId: "diag-file-count",
	toolbar: treeToolbar({ prefix: "diag", noun: "folder" }),
})}
${searchField({ id: "diag-search", placeholder: "Search files" })}
${checkboxRow({ id: "diag-show-notscored", label: "Show not scored", rowId: "diag-notscored-row" })}
      <hr class="diag-divider" id="diag-notscored-divider">
${textButton({
	id: "diag-filters-toggle",
	classes: "diag-filters-toggle",
	ariaExpanded: false,
	content: `${icon({ name: "filter", ariaHidden: true, indent: 8 })}
        Filters
        <span class="diag-filters-count" id="diag-filters-count" style="display:none"></span>
        <span class="diag-filters-caret">\u25B8</span>`,
})}
      <div class="filter-rows" id="diag-filters-body">
        <div class="sev-filters">
          <span class="filter-label">Severity</span>
${pillGroup({
	name: "sev",
	indent: 10,
	items: [
		{ value: "all", label: "All", active: true },
		{ value: "error", label: "Errors" },
		{ value: "warning", label: "Warnings" },
		{ value: "info", label: "Info" },
	],
})}
        </div>
        <div class="scope-filters">
          <span class="filter-label">Scope</span>
${pillGroup({
	name: "scope",
	indent: 10,
	items: [
		{ value: "all", label: "All", active: true },
		{ value: "file", label: "File" },
		{ value: "project", label: "Project" },
	],
})}
        </div>
        <div class="cat-filters">
          <span class="filter-label">Category</span>
${pillGroup({
	name: "cat",
	indent: 10,
	items: [
		{ value: "all", label: "All", active: true },
		{ value: "security", label: "Security" },
		{ value: "correctness", label: "Correctness" },
		{ value: "schema", label: "Schema" },
		{ value: "architecture", label: "Architecture" },
		{ value: "performance", label: "Performance" },
	],
})}
        </div>
      </div>
    </div>
    <div id="diagnosis-rule-list"></div>
  </div>
  <div id="diagnosis-main">
${emptyState({ id: "diagnosis-empty-state", icon: { name: "fileText", size: 48, stroke: "var(--text-dim)", strokeWidth: "1.5" }, text: "Select a file to view its diagnostics" })}
    <div id="diagnosis-file-view" style="display:none">
      <div id="diagnosis-file-header"></div>
      <div id="diagnosis-file-code"></div>
      <div id="diagnosis-file-info"></div>
    </div>
  </div>
</div>
`;
