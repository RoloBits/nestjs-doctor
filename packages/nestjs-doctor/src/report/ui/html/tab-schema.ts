export const TAB_SCHEMA = `
<!-- ── Tab: Schema ── -->
<div class="tab-content" id="tab-schema">
  <div id="schema-sidebar">
    <div class="schema-sidebar-sticky">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title" id="schema-sidebar-title">Tables</span>
        <span class="schema-entity-count" id="schema-entity-count"></span>
        <span style="flex:1"></span>
        <button class="st-btn has-tip" id="schema-expand-all" aria-label="Expand all" data-tip="Expand all \u00b7 open every table in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 5l2.5 3L16 5"/>
          </svg>
        </button>
        <button class="st-btn has-tip" id="schema-collapse-all" aria-label="Collapse all" data-tip="Collapse all \u00b7 close every table in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 11l2.5-3L16 11"/>
          </svg>
        </button>
        <button class="st-btn has-tip" id="schema-sidebar-collapse" aria-label="Hide the table list" data-tip="Hide list \u00b7 give the diagram the whole width">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 3 4 8 9 13"/><line x1="13" y1="3" x2="13" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="mg-side-search">
        <input type="search" id="schema-search" placeholder="Search tables" spellcheck="false" autocomplete="off">
      </div>
      <label class="schema-sync has-tip" data-tip="Sync \u00b7 the list follows the table you pick in the diagram">
        <input type="checkbox" id="schema-sync-sidebar" checked>
        <span>Sync with diagram</span>
      </label>
      <div class="schema-disclaimer">Schema inferred from source code — may not reflect the actual database.</div>
    </div>
    <div id="schema-entity-list"></div>
  </div>
  <div id="schema-main">
    <div id="schema-canvas-wrap">
      <button class="st-btn has-tip" id="schema-sidebar-show" aria-label="Show the table list" data-tip="Show list \u00b7 bring the table list back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="7 3 12 8 7 13"/><line x1="3" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
      <div id="schema-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        <p>Select an entity from the sidebar to explore its schema</p>
        <button class="st-btn schema-empty-action" id="schema-show-all">Show all tables</button>
      </div>
      <div id="schema-toolbar">
      <div id="schema-zoombar">
        <button class="st-btn schema-zoom-btn has-tip" id="schema-zoom-out" aria-label="Zoom out" data-tip="Zoom out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <input type="range" id="schema-zoom-range" min="5" max="500" step="1" value="100" aria-label="Zoom">
        <button class="st-btn schema-zoom-btn has-tip" id="schema-zoom-in" aria-label="Zoom in" data-tip="Zoom in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="schema-zoom-value has-tip" id="schema-zoom-value" aria-label="100% \u00b7 fit to view" data-tip="Fit \u00b7 size the diagram to the window">100%</button>
      </div>
        <button class="st-btn schema-diagram-btn has-tip" id="schema-toggle-view" aria-label="Show all tables" data-tip="All tables \u00b7 lay out the whole schema at once">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
        <button class="st-btn schema-diagram-btn has-tip" id="schema-recenter" aria-label="Re-center diagram" data-tip="Re-center \u00b7 bring the diagram back into view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
        <button class="st-btn schema-diagram-btn has-tip" id="schema-expand-tables" aria-label="Expand tables" data-tip="Expand \u00b7 show the columns inside each table">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <button class="st-btn schema-diagram-btn has-tip" id="schema-minimize-tables" aria-label="Minimize tables" data-tip="Minimize \u00b7 collapse tables to names only">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <button class="st-btn schema-diagram-btn has-tip" id="schema-toggle-cols" aria-label="Show every column" data-tip="Every column \u00b7 stop cutting the list at seven">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/>
            <line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
      </div>
      <canvas id="schema-canvas"></canvas>
      <div id="schema-tooltip" class="schema-tooltip" style="display:none"></div>
      <div id="schema-rel-badge" class="schema-rel-badge" style="display:none"></div>
    </div>
    <div id="schema-diag-panel">
      <div id="schema-diag-header">
        <svg class="schema-diag-chevron" id="schema-diag-chevron" width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
