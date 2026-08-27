import { closeButton, iconButton } from "../atoms/button.js";
import { heading } from "../atoms/heading.js";
import { searchInput } from "../atoms/search-input.js";
import { checkboxRow } from "../molecules/checkbox-row.js";
import { legend } from "../molecules/legend.js";
import { zoomBar } from "../molecules/zoom-bar.js";

export const TAB_MODULES_GRAPH = `
<!-- ── Tab: Modules Graph ── -->
<div class="tab-content" id="tab-modules">
  <div id="mg-sidebar">
    <div class="schema-sidebar-sticky">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title">Projects</span>
        <span class="schema-entity-count" id="mg-project-count"></span>
        <span style="flex:1"></span>
${iconButton({ id: "mg-expand-all", icon: "expandAll", ariaLabel: "Expand all", tip: "Expand all · open every project in the list" })}
${iconButton({ id: "mg-collapse-all", icon: "collapseAll", ariaLabel: "Collapse all", tip: "Collapse all · close every project in the list" })}
${iconButton({ id: "mg-sidebar-collapse", icon: "sidebarCollapse", ariaLabel: "Hide the project list", tip: "Hide list · give the graph the whole width" })}
      </div>
      <div class="mg-side-search">
${searchInput({ id: "mg-search", placeholder: "Search projects and modules" })}
      </div>
      <div class="mg-toggle-row">
${checkboxRow({ id: "mg-globals", label: "Show @Global() reach", indent: 8 })}
${checkboxRow({ id: "mg-show-external", label: "Show external modules", indent: 8 })}
      </div>
    </div>
    <div id="mg-tree"></div>
    <div id="detail">
${closeButton({ id: "close-detail", classes: "close-btn" })}
${heading({ level: 2, id: "detail-name", indent: 6 })}
      <div id="detail-badges"></div>
      <div class="filepath" id="detail-path"></div>
      <div id="detail-sections"></div>
    </div>
  </div>
  <div id="mg-resizer"></div>
  <div id="mg-main">
  <div id="mg-wrap">
${iconButton({ id: "mg-sidebar-show", icon: "sidebarShow", ariaLabel: "Show the project list", tip: "Show list · bring the project list back", indent: 4 })}
    <div id="mg-toolbar">
${zoomBar({ prefix: "mg", subject: "graph" })}
${iconButton({ id: "mg-recenter", icon: "recenter", modifier: "schema-diagram-btn", ariaLabel: "Re-center graph", tip: "Re-center · bring the graph back into view", indent: 6 })}
${iconButton({ id: "mg-info", icon: "info", modifier: "schema-diagram-btn", ariaLabel: "Legend and concepts", tip: "Info · legend and NestJS concepts", indent: 6 })}
    </div>
    <canvas id="graph"></canvas>
    <div id="mg-tooltip" class="schema-tooltip" style="display:none"></div>
    <div id="mg-empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
      <p>No modules were found in this project</p>
    </div>
  </div>
  <div id="mg-dock" data-active="problems">
    <div id="mg-dock-header">
      <span class="mg-dock-tab" id="mg-dock-tab-problems" data-dock-tab="problems">Module problems <span class="schema-entity-count" id="mg-problems-count"></span></span>
      <span class="mg-dock-tab" id="mg-dock-tab-trace" data-dock-tab="trace" style="display:none">Boot trace <span class="schema-entity-count" id="mg-trace-ms"></span></span>
      <span class="mg-trace-info" tabindex="0" role="img" aria-label="How to read the trace" data-tip="How to read the trace&#10;\u2022 bars scale to the slowest row&#10;\u2022 yellow segment \u2248 the class's own work&#10;\u2022 dimmed hollow bar = reused, built earlier&#10;\u2022 rows are the create phase&#10;\u2022 +ms chips = lifecycle hooks">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </span>
      <span style="flex:1"></span>
      <span class="mg-problems-chevron" id="mg-dock-chevron">▴</span>
    </div>
    <div id="mg-problems-list"></div>
    <div id="mg-trace-phases"></div>
    <div id="mg-trace-body"></div>
  </div>
  <div id="mg-info-pop">
${heading({ level: 3, text: "Legend", indent: 2 })}
${legend([
	{
		kind: "color",
		style: "background:#1a1a2e;border-color:#333",
		label: "Module",
	},
	{
		kind: "color",
		style: "background:#1a2e1a;border-color:#2a5a2a",
		label: "Root module",
	},
	{
		kind: "color",
		style: "background:#2e1a1a;border-color:#ea2845",
		label: "Circular dependency",
	},
	{
		kind: "color",
		style: "background:#2a2410;border-color:#fbbf24",
		label: "Global module",
	},
	{ kind: "line", style: "background:#444", label: "Import" },
	{
		kind: "line",
		style: "background:#ea2845;border-top:1px dashed #ea2845;height:0",
		label: "Circular import",
	},
	{
		kind: "line",
		style: "background:transparent;border-top:2px dashed #22d3ee;height:0",
		label: "Cross-project import",
		id: "legend-cross",
		hidden: true,
	},
	{
		kind: "line",
		style: "background:transparent;border-top:2px dotted #fbbf24;height:0",
		label: "Global reach (no import)",
		id: "legend-global-reach",
		hidden: true,
	},
])}
  <hr class="divider">
  <details class="concepts-details">
  <summary>NestJS Concepts</summary>
  <dl>
    <dt>Providers</dt>
    <dd>Injectable services (business logic, repositories, helpers) registered in the module's <code>providers</code> array. The core building block of NestJS DI.</dd>
    <dt>Controllers</dt>
    <dd>HTTP request handlers (routes) registered in the module's <code>controllers</code> array. They receive requests and delegate to providers.</dd>
    <dt>Imports</dt>
    <dd>Other modules this module depends on. Importing a module makes its exported providers available for injection.</dd>
    <dt>Exports</dt>
    <dd>Providers this module makes available to other modules that import it. Without exporting, providers stay private to the module.</dd>
    <dt style="color:#ea2845">Circular Dependency</dt>
    <dd>A cycle in module <strong style="color:#ccc">imports</strong>: Module A imports Module B, and Module B imports Module A (directly or through a chain like A &rarr; B &rarr; C &rarr; A). Because NestJS resolves modules in order, one side hasn't finished initializing — so its <strong style="color:#ccc">providers</strong> are <code>undefined</code> when the other tries to inject them.</dd>
    <dd style="margin-top:4px">This signals <strong style="color:#ccc">tangled responsibilities</strong> — two modules that can't work without each other should probably be one module, or the shared logic should be extracted into its own module.</dd>
    <dd style="margin-top:4px"><strong style="color:#ccc">Fix:</strong> Extract the shared providers into a new module both can import, breaking the cycle. This is the proper long-term solution.</dd>
    <dd style="margin-top:4px"><code>forwardRef()</code> tells NestJS to defer resolving a dependency until both modules are loaded. It works, but it's a <strong style="color:#ccc">band-aid</strong> — the cycle still exists, the code is harder to follow, and adding more modules to the chain makes it fragile. Use it only as a temporary fix while you refactor.</dd>
  </dl>
  </details>
  </div>
  </div>
</div>`;
