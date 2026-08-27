import { iconButton } from "../components/button.js";

export const TAB_DIAGNOSIS = `
<!-- ── Tab: Diagnosis ── -->
<div class="tab-content" id="tab-diagnosis">
  <div id="diagnosis-sidebar">
    <div class="diagnosis-toolbar">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title">Files</span>
        <span class="schema-entity-count" id="diag-file-count"></span>
        <span style="flex:1"></span>
${iconButton({ id: "diag-expand-all", icon: "expandAll", ariaLabel: "Expand all", tip: "Expand all \u00b7 open every folder in the list" })}
${iconButton({ id: "diag-collapse-all", icon: "collapseAll", ariaLabel: "Collapse all", tip: "Collapse all \u00b7 close every folder in the list" })}
      </div>
      <div class="mg-side-search">
        <input type="search" id="diag-search" placeholder="Search files" spellcheck="false" autocomplete="off">
      </div>
      <label class="schema-sync" id="diag-notscored-row">
        <input type="checkbox" id="diag-show-notscored">
        <span>Show not scored</span>
      </label>
      <hr class="diag-divider" id="diag-notscored-divider">
      <button class="diag-filters-toggle" id="diag-filters-toggle" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filters
        <span class="diag-filters-count" id="diag-filters-count" style="display:none"></span>
        <span class="diag-filters-caret">\u25B8</span>
      </button>
      <div class="filter-rows" id="diag-filters-body">
        <div class="sev-filters">
          <span class="filter-label">Severity</span>
          <button class="sev-pill active" data-sev="all">All</button>
          <button class="sev-pill" data-sev="error">Errors</button>
          <button class="sev-pill" data-sev="warning">Warnings</button>
          <button class="sev-pill" data-sev="info">Info</button>
        </div>
        <div class="scope-filters">
          <span class="filter-label">Scope</span>
          <button class="scope-pill active" data-scope="all">All</button>
          <button class="scope-pill" data-scope="file">File</button>
          <button class="scope-pill" data-scope="project">Project</button>
        </div>
        <div class="cat-filters">
          <span class="filter-label">Category</span>
          <button class="cat-pill active" data-cat="all">All</button>
          <button class="cat-pill" data-cat="security">Security</button>
          <button class="cat-pill" data-cat="correctness">Correctness</button>
          <button class="cat-pill" data-cat="schema">Schema</button>
          <button class="cat-pill" data-cat="architecture">Architecture</button>
          <button class="cat-pill" data-cat="performance">Performance</button>
        </div>
      </div>
    </div>
    <div id="diagnosis-rule-list"></div>
  </div>
  <div id="diagnosis-main">
    <div id="diagnosis-empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <p>Select a file to view its diagnostics</p>
    </div>
    <div id="diagnosis-file-view" style="display:none">
      <div id="diagnosis-file-header"></div>
      <div id="diagnosis-file-code"></div>
      <div id="diagnosis-file-info"></div>
    </div>
  </div>
</div>
`;
