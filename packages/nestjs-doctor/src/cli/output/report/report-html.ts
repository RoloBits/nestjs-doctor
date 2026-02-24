export function getReportHtml(): string {
	return `
<!-- ── Header Row 1 ── -->
<div id="header-row1">
  <div class="brand">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea2845" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4.8"/>
      <path d="M4 5V4.8a2 2 0 0 1 2-2h.2"/>
      <path d="M14 2h.2a2 2 0 0 1 2 2v.2"/>
      <path d="M18 5v-.2a2 2 0 0 0-2-2h-.2"/>
      <path d="M4 14v.2a2 2 0 0 0 2 2h.2"/>
      <path d="M14 16h.2a2 2 0 0 0 2-2v-.2"/>
      <circle cx="11" cy="9" r="2"/>
      <path d="M11 11v5"/>
      <path d="M9 18h4"/>
      <path d="M9 22h4"/>
      <path d="M11 18v4"/>
    </svg>
    nestjs-doctor
  </div>
  <div class="meta" id="header-meta"></div>
  <div class="spacer"></div>
  <a class="github-link" href="https://github.com/RoloBits/nestjs-doctor" target="_blank" rel="noopener">
    <svg width="18" height="18" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
</div>

<!-- ── Header Row 2 (Tab bar) ── -->
<div id="header-row2">
  <button class="tab-btn active" data-tab="summary">Summary</button>
  <button class="tab-btn" data-tab="diagnosis">Diagnosis <span class="count-badge" id="diagnosis-count-badge"></span></button>
  <button class="tab-btn" data-tab="modules">Modules Graph</button>
  <button class="tab-btn" data-tab="lab">Lab</button>
  <div class="tab-spacer"></div>
  <div class="tab-controls" id="graph-controls">
    <select id="project-filter"><option value="all">All projects</option></select>
  </div>
</div>

<!-- ── Tab: Summary ── -->
<div class="tab-content active" id="tab-summary"></div>

<!-- ── Tab: Diagnosis ── -->
<div class="tab-content" id="tab-diagnosis">
  <div id="diagnosis-sidebar">
    <div class="diagnosis-toolbar">
      <div class="sev-filters">
        <button class="sev-pill active" data-sev="all">All</button>
        <button class="sev-pill" data-sev="error">Errors</button>
        <button class="sev-pill" data-sev="warning">Warnings</button>
        <button class="sev-pill" data-sev="info">Info</button>
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
      <p>Select a finding to view its source code</p>
    </div>
    <div id="diagnosis-code-view" style="display:none">
      <div id="diagnosis-code-header"></div>
      <div id="diagnosis-code-body"></div>
      <div id="diagnosis-code-help"></div>
      <div id="diagnosis-code-examples"></div>
    </div>
  </div>
</div>

<!-- ── Tab: Lab ── -->
<div class="tab-content" id="tab-lab">
  <div class="playground-editor">
    <div class="playground-section-label">RULE LAB</div>
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
    <div id="pg-code-viewer" style="display:none">
      <div id="pg-code-header" class="playground-code-header"></div>
      <div id="pg-code-body" class="playground-code-body"></div>
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

<!-- ── Tab: Modules Graph ── -->
<div class="tab-content" id="tab-modules">
  <canvas id="graph"></canvas>
  <button id="focus-btn">Unfocus</button>
</div>

<!-- ── Sidebar (Graph tab) ── -->
<div id="sidebar">
  <h3>Legend</h3>
  <div class="legend-item"><div class="legend-color" style="background:#1a1a2e;border-color:#333"></div> Module</div>
  <div class="legend-item"><div class="legend-color" style="background:#1a2e1a;border-color:#2a5a2a"></div> Root module</div>
  <div class="legend-item"><div class="legend-color" style="background:#2e1a1a;border-color:#ea2845"></div> Circular dependency</div>
  <div class="legend-item"><div class="legend-line" style="background:#444"></div> Import</div>
  <div class="legend-item"><div class="legend-line" style="background:#ea2845;border-top:1px dashed #ea2845;height:0"></div> Circular import</div>
  <div id="project-legend"></div>
  <hr class="divider">
  <h3>NestJS Concepts</h3>
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
</div>

<!-- ── Detail Panel ── -->
<div id="detail">
  <button class="close-btn" id="close-detail">&times;</button>
  <h2 id="detail-name"></h2>
  <div class="filepath" id="detail-path"></div>
  <div id="detail-sections"></div>
</div>

<div id="focus-hint">Focused view — click empty space or press Esc to exit</div>`;
}
