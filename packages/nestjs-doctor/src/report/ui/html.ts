export function getReportHtml(): string {
	return `
<!-- ── Header Row 1 ── -->
<div id="header-row1">
  <div class="brand">
    <img src="https://nestjs.doctor/logo.png" width="22" height="22" alt="nestjs-doctor logo" style="border-radius:4px">
    nestjs-doctor
  </div>
  <div class="meta" id="header-meta"></div>
  <div class="spacer"></div>
  <div class="nav-actions">
    <a class="nav-btn" href="https://nestjs.doctor/docs" target="_blank" rel="noopener">docs</a>
    <a class="nav-btn" href="https://github.com/RoloBits/nestjs-doctor" target="_blank" rel="noopener">github</a>
  </div>
</div>

<!-- ── Header Row 2 (Tab bar) ── -->
<div id="header-row2">
  <button class="tab-btn active" data-tab="summary"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>Summary</button>
  <button class="tab-btn" data-tab="diagnosis"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>Findings <span class="count-badge" id="diagnosis-count-badge"></span></button>
  <button class="tab-btn" data-tab="modules"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>Modules Graph</button>
  <button class="tab-btn" data-tab="endpoints" id="tab-btn-endpoints" style="display:none"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>Endpoints <span class="beta-badge">Beta</span></button>
  <button class="tab-btn" data-tab="schema" id="tab-btn-schema" style="display:none"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>Relational Schema</button>
  <button class="tab-btn" data-tab="lab"><svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>Rule Lab</button>
  <div class="tab-spacer"></div>
</div>

<!-- ── Tab: Summary ── -->
<div class="tab-content active" id="tab-summary"></div>

<!-- ── Tab: Diagnosis ── -->
<div class="tab-content" id="tab-diagnosis">
  <div id="diagnosis-sidebar">
    <div class="diagnosis-toolbar">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title">Files</span>
        <span class="schema-entity-count" id="diag-file-count"></span>
        <span style="flex:1"></span>
        <button class="st-btn has-tip" id="diag-expand-all" aria-label="Expand all" data-tip="Expand all \u00b7 open every folder in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 5l2.5 3L16 5"/>
          </svg>
        </button>
        <button class="st-btn has-tip" id="diag-collapse-all" aria-label="Collapse all" data-tip="Collapse all \u00b7 close every folder in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 11l2.5-3L16 11"/>
          </svg>
        </button>
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

<!-- ── Tab: Lab ── -->
<div class="tab-content" id="tab-lab">
  <div class="playground-editor">
    <div class="playground-section-label playground-title">RULE LAB</div>
    <p class="playground-subtitle">Write and test <a href="https://www.nestjs.doctor/docs/custom-rules" target="_blank" rel="noopener">custom rules</a> against your project. Use <code>/nestjs-doctor-create-rule</code> with an AI agent to <a href="https://www.nestjs.doctor/docs/coding-agents" target="_blank" rel="noopener">scaffold rules automatically</a>.</p>
    <div class="playground-form">
      <div class="playground-form-row">
        <div class="playground-field">
          <label for="pg-rule-id">Rule ID</label>
          <input type="text" id="pg-rule-id" value="my-rule" spellcheck="false">
        </div>
        <div class="playground-field">
          <label for="pg-category">Category</label>
          <select id="pg-category">
            <option value="correctness" selected>correctness</option>
            <option value="security">security</option>
            <option value="performance">performance</option>
            <option value="architecture">architecture</option>
          </select>
        </div>
        <div class="playground-field">
          <label for="pg-severity">Severity</label>
          <select id="pg-severity">
            <option value="warning" selected>warning</option>
            <option value="error">error</option>
            <option value="info">info</option>
          </select>
        </div>
      </div>
      <div class="playground-form-row">
        <div class="playground-field playground-field-wide">
          <label for="pg-description">Description</label>
          <input type="text" id="pg-description" placeholder="What does this rule check?" spellcheck="false">
        </div>
      </div>
    </div>
    <div class="playground-preset">
      <div class="playground-field">
        <label for="pg-scope">Scope</label>
        <select id="pg-scope">
          <option value="file" selected>File rule</option>
          <option value="project">Project rule</option>
        </select>
      </div>
      <div class="playground-preset-sep"></div>
      <div class="playground-field playground-field-wide">
        <label for="pg-preset">Load example</label>
        <select id="pg-preset">
        <optgroup label="File rules">
          <option value="todo">Find TODO comments</option>
          <option value="console-log">Find console.log statements</option>
          <option value="large-file">Detect large files</option>
        </optgroup>
        <optgroup label="Project rules">
          <option value="orphan-modules">Find orphan modules</option>
          <option value="unused-providers">Find unused providers</option>
        </optgroup>
      </select>
      </div>
    </div>
    <div class="playground-section-label">CHECK FUNCTION</div>
    <div id="pg-cm-editor" class="pg-cm-wrap"></div>
    <div id="pg-context-hint" class="pg-context-hint">context.fileText · context.filePath · context.report({ message, line })</div>
    <script id="pg-code-init" type="text/plain">// context.fileText  — full source code (string)
// context.filePath  — file path (string)
// context.report({ message, line })  — report a finding

const lines = context.fileText.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("TODO")) {
    context.report({
      message: "Found TODO comment",
      line: i + 1,
    });
  }
}</script>
    <div class="playground-actions">
      <button id="pg-run-btn">&#9654; Run Rule</button>
    </div>
    <div id="pg-error" class="playground-error" style="display:none"></div>
  </div>
  <div class="playground-results">
    <div class="playground-section-label">RESULTS <span id="pg-result-count"></span></div>
    <div id="pg-file-view" style="display:none">
      <div id="pg-file-header"></div>
      <div id="pg-file-code" class="playground-code-body"></div>
    </div>
    <div id="pg-result-list"></div>
    <div id="pg-result-empty" class="playground-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      <p>Write a check function and click Run</p>
    </div>
  </div>
</div>

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

<!-- ── Tab: Endpoints ── -->
<div class="tab-content" id="tab-endpoints">
  <div id="ep-code-panel" class="ep-code-panel">
    <div class="ep-code-panel-header">
      <div class="ep-code-panel-title">
        <span class="ep-code-panel-class" id="ep-code-panel-class"></span>
        <span class="ep-code-panel-method" id="ep-code-panel-method"></span>
      </div>
      <div class="ep-code-panel-path" id="ep-code-panel-path"></div>
      <button class="ep-code-panel-close" id="ep-code-panel-close">&times;</button>
    </div>
    <div class="ep-code-panel-body" id="ep-code-panel-body"></div>
    <div class="ep-code-panel-resize" id="ep-code-panel-resize"></div>
  </div>
  <div id="endpoints-sidebar">
    <div class="endpoints-sidebar-sticky">
      <div class="endpoints-sidebar-header">
        <span class="schema-sidebar-title">Endpoints</span>
        <span class="schema-entity-count" id="endpoints-count"></span>
        <span style="flex:1"></span>
      </div>
    </div>
    <div id="endpoints-list"></div>
  </div>
  <div id="endpoints-main">
    <div id="endpoints-canvas-wrap">
      <div id="endpoints-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        <p>Select an endpoint from the sidebar to view its dependency graph</p>
      </div>
      <div id="endpoints-toolbar">
        <button class="st-btn schema-diagram-btn" id="endpoints-recenter" title="Re-center diagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      </div>
      <canvas id="endpoints-canvas"></canvas>
      <div id="endpoints-tooltip" class="schema-tooltip" style="display:none"></div>
    </div>
  </div>
</div>

<!-- ── Tab: Modules Graph ── -->
<div class="tab-content" id="tab-modules">
  <div id="mg-sidebar">
    <div class="schema-sidebar-sticky">
      <div class="schema-sidebar-header">
        <span class="schema-sidebar-title">Projects</span>
        <span class="schema-entity-count" id="mg-project-count"></span>
        <span style="flex:1"></span>
        <button class="st-btn has-tip" id="mg-expand-all" aria-label="Expand all" data-tip="Expand all · open every project in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 5l2.5 3L16 5"/>
          </svg>
        </button>
        <button class="st-btn has-tip" id="mg-collapse-all" aria-label="Collapse all" data-tip="Collapse all · close every project in the list">
          <svg viewBox="0 0 17 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="7" x2="8" y2="7"/><line x1="1" y1="11" x2="8" y2="11"/>
            <path d="M11 11l2.5-3L16 11"/>
          </svg>
        </button>
        <button class="st-btn has-tip" id="mg-sidebar-collapse" aria-label="Hide the project list" data-tip="Hide list · give the graph the whole width">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 3 4 8 9 13"/><line x1="13" y1="3" x2="13" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="mg-side-search">
        <input type="search" id="mg-search" placeholder="Search projects and modules" spellcheck="false" autocomplete="off">
      </div>
      <div class="mg-toggle-row">
        <label class="schema-sync">
          <input type="checkbox" id="mg-globals">
          <span>Show @Global() reach</span>
        </label>
        <label class="schema-sync">
          <input type="checkbox" id="mg-show-external">
          <span>Show external modules</span>
        </label>
      </div>
    </div>
    <div id="mg-tree"></div>
    <div id="detail">
      <button class="close-btn" id="close-detail">&times;</button>
      <h2 id="detail-name"></h2>
      <div id="detail-badges"></div>
      <div class="filepath" id="detail-path"></div>
      <div id="detail-sections"></div>
    </div>
  </div>
  <div id="mg-resizer"></div>
  <div id="mg-main">
  <div id="mg-wrap">
    <button class="st-btn has-tip" id="mg-sidebar-show" aria-label="Show the project list" data-tip="Show list · bring the project list back">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="7 3 12 8 7 13"/><line x1="3" y1="3" x2="3" y2="13"/>
      </svg>
    </button>
    <div id="mg-toolbar">
      <div id="mg-zoombar">
        <button class="st-btn schema-zoom-btn has-tip" id="mg-zoom-out" aria-label="Zoom out" data-tip="Zoom out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <input type="range" id="mg-zoom-range" min="5" max="500" step="1" value="100" aria-label="Zoom">
        <button class="st-btn schema-zoom-btn has-tip" id="mg-zoom-in" aria-label="Zoom in" data-tip="Zoom in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="schema-zoom-value has-tip" id="mg-zoom-value" aria-label="100% · fit to view" data-tip="Fit · size the graph to the window">100%</button>
      </div>
      <button class="st-btn schema-diagram-btn has-tip" id="mg-recenter" aria-label="Re-center graph" data-tip="Re-center · bring the graph back into view">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
      </button>
      <button class="st-btn schema-diagram-btn has-tip" id="mg-info" aria-label="Legend and concepts" data-tip="Info · legend and NestJS concepts">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
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
  <h3>Legend</h3>
  <div class="legend-item"><div class="legend-color" style="background:#1a1a2e;border-color:#333"></div> Module</div>
  <div class="legend-item"><div class="legend-color" style="background:#1a2e1a;border-color:#2a5a2a"></div> Root module</div>
  <div class="legend-item"><div class="legend-color" style="background:#2e1a1a;border-color:#ea2845"></div> Circular dependency</div>
  <div class="legend-item"><div class="legend-color" style="background:#2a2410;border-color:#fbbf24"></div> Global module</div>
  <div class="legend-item"><div class="legend-line" style="background:#444"></div> Import</div>
  <div class="legend-item"><div class="legend-line" style="background:#ea2845;border-top:1px dashed #ea2845;height:0"></div> Circular import</div>
  <div class="legend-item" id="legend-cross" style="display:none"><div class="legend-line" style="background:transparent;border-top:2px dashed #22d3ee;height:0"></div> Cross-project import</div>
  <div class="legend-item" id="legend-global-reach" style="display:none"><div class="legend-line" style="background:transparent;border-top:2px dotted #fbbf24;height:0"></div> Global reach (no import)</div>
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
}
