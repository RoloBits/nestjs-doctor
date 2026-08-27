import { iconButton, textButton } from "../atoms/button.js";
import { icon } from "../atoms/icon.js";
import { searchInput } from "../atoms/search-input.js";
import { checkboxRow } from "../molecules/checkbox-row.js";
import { zoomBar } from "../molecules/zoom-bar.js";

export const TAB_SCHEMA = `
<!-- ── Tab: Schema ── -->
<div class="tab-content" id="tab-schema">
  <div id="schema-sidebar">
    <div class="schema-sidebar-sticky">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title" id="schema-sidebar-title">Tables</span>
        <span class="schema-entity-count" id="schema-entity-count"></span>
        <span style="flex:1"></span>
${iconButton({ id: "schema-expand-all", icon: "expandAll", ariaLabel: "Expand all", tip: "Expand all \u00b7 open every table in the list" })}
${iconButton({ id: "schema-collapse-all", icon: "collapseAll", ariaLabel: "Collapse all", tip: "Collapse all \u00b7 close every table in the list" })}
${iconButton({ id: "schema-sidebar-collapse", icon: "sidebarCollapse", ariaLabel: "Hide the table list", tip: "Hide list \u00b7 give the diagram the whole width" })}
      </div>
      <div class="mg-side-search">
${searchInput({ id: "schema-search", placeholder: "Search tables" })}
      </div>
${checkboxRow({ id: "schema-sync-sidebar", label: "Sync with diagram", checked: true, tip: "Sync \u00b7 the list follows the table you pick in the diagram" })}
      <div class="schema-disclaimer">Schema inferred from source code — may not reflect the actual database.</div>
    </div>
    <div id="schema-entity-list"></div>
  </div>
  <div id="schema-main">
    <div id="schema-canvas-wrap">
${iconButton({ id: "schema-sidebar-show", icon: "sidebarShow", ariaLabel: "Show the table list", tip: "Show list \u00b7 bring the table list back", indent: 6 })}
      <div id="schema-empty-state">
${icon({ name: "toggleView", size: 48, stroke: "var(--text-dim)", strokeWidth: "1.5", indent: 8 })}
        <p>Select an entity from the sidebar to explore its schema</p>
${textButton({ id: "schema-show-all", classes: "st-btn schema-empty-action", label: "Show all tables", indent: 8 })}
      </div>
      <div id="schema-toolbar">
${zoomBar({ prefix: "schema", subject: "diagram" })}
${iconButton({ id: "schema-toggle-view", icon: "toggleView", modifier: "schema-diagram-btn", ariaLabel: "Show all tables", tip: "All tables \u00b7 lay out the whole schema at once" })}
${iconButton({ id: "schema-recenter", icon: "recenter", modifier: "schema-diagram-btn", ariaLabel: "Re-center diagram", tip: "Re-center \u00b7 bring the diagram back into view" })}
${iconButton({ id: "schema-expand-tables", icon: "expandTables", modifier: "schema-diagram-btn", ariaLabel: "Expand tables", tip: "Expand \u00b7 show the columns inside each table" })}
${iconButton({ id: "schema-minimize-tables", icon: "minimizeTables", modifier: "schema-diagram-btn", ariaLabel: "Minimize tables", tip: "Minimize \u00b7 collapse tables to names only" })}
${iconButton({ id: "schema-toggle-cols", icon: "toggleColumns", modifier: "schema-diagram-btn", ariaLabel: "Show every column", tip: "Every column \u00b7 stop cutting the list at seven" })}
      </div>
      <canvas id="schema-canvas"></canvas>
      <div id="schema-tooltip" class="schema-tooltip" style="display:none"></div>
      <div id="schema-rel-badge" class="schema-rel-badge" style="display:none"></div>
    </div>
    <div id="schema-diag-panel">
      <div id="schema-diag-header">
${icon({ name: "chevronSmall", classes: "schema-diag-chevron", id: "schema-diag-chevron", size: 10, indent: 8 })}
        <span class="schema-diag-title">Problems</span>
        <span class="schema-diag-count" id="schema-diag-count">0</span>
      </div>
      <div id="schema-diag-body" style="display:none">
        <div id="schema-diag-list"></div>
      </div>
    </div>
  </div>
</div>
`;
