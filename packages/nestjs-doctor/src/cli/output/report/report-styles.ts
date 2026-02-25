export function getReportStyles(): string {
	return `
:root {
  --bg: #0a0a0a;
  --surface: #111111;
  --surface-hover: #1a1a1a;
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.15);
  --text: #e0e0e0;
  --text-muted: #888;
  --text-dim: #666;
  --white: #fff;
  --nest-red: #ea2845;
  --cat-security: #ef4444;
  --cat-performance: #f59e0b;
  --cat-correctness: #3b82f6;
  --cat-architecture: #8b5cf6;
  --sev-error: #ef4444;
  --sev-warning: #f59e0b;
  --sev-info: #3b82f6;
  --score-green: #4ade80;
  --score-yellow: #eab308;
  --score-red: #ef4444;
  --header-h: 96px;
  --row1-h: 56px;
  --row2-h: 40px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: var(--font); overflow: hidden; }
canvas { display: block; cursor: grab; }
canvas:active { cursor: grabbing; }

/* ── Header Row 1 ── */
#header-row1 {
  position: fixed; top: 0; left: 0; right: 0; height: var(--row1-h);
  padding: 0 20px;
  background: rgba(10,10,10,0.95);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 14px;
  z-index: 20;
  backdrop-filter: blur(12px);
}
#header-row1 .brand {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: var(--white);
  white-space: nowrap; flex-shrink: 0;
}
#header-row1 .brand svg { flex-shrink: 0; }
#header-row1 .meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
#header-row1 .meta-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--border);
  color: var(--text-muted); white-space: nowrap;
}
#header-row1 .spacer { flex: 1; min-width: 0; }
#header-row1 .github-link {
  display: flex; align-items: center;
  text-decoration: none; color: #ccc;
  padding: 6px; border-radius: 6px;
  transition: background 0.15s, color 0.15s; flex-shrink: 0;
}
#header-row1 .github-link:hover { background: rgba(255,255,255,0.08); color: var(--white); }
#header-row1 .github-link svg { fill: currentColor; }
@media (max-width: 640px) {
  #header-row1 .meta { display: none; }
}

/* ── Header Row 2 (Tab bar) ── */
#header-row2 {
  position: fixed; top: var(--row1-h); left: 0; right: 0; height: var(--row2-h);
  padding: 0 20px;
  background: rgba(10,10,10,0.95);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 0;
  z-index: 20;
  backdrop-filter: blur(12px);
}
.tab-btn {
  background: none; border: none; color: var(--text-muted);
  font-size: 13px; font-family: var(--font); font-weight: 500;
  padding: 0 16px; height: 100%; cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  display: flex; align-items: center; gap: 6px;
}
.tab-btn:hover { color: var(--text); }
.tab-btn.active { color: var(--white); border-bottom-color: var(--nest-red); }
.tab-btn .count-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 10px;
  background: rgba(239,68,68,0.15); color: var(--sev-error);
  font-weight: 600; line-height: 1.4;
}
.tab-btn .count-badge.clean {
  background: rgba(74,222,128,0.15); color: var(--score-green);
}
.tab-spacer { flex: 1; }
.tab-controls { display: flex; align-items: center; gap: 8px; height: 100%; }
.tab-controls select {
  font-size: 11px; padding: 4px 10px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer; font-family: var(--font);
  outline: none; display: none;
}
.tab-controls select:hover { background: rgba(255,255,255,0.12); color: var(--white); }
.tab-controls select.visible { display: inline-block; }

/* ── Tab content containers ── */
.tab-content { display: none; position: fixed; top: var(--header-h); left: 0; right: 0; bottom: 0; }
.tab-content.active { display: block; }
#tab-modules { z-index: 1; left: 340px; }
#focus-btn {
  position: absolute; bottom: 20px; left: 20px;
  font-size: 13px; padding: 8px 18px; border-radius: 8px;
  background: rgba(234,40,69,0.15); border: 1px solid var(--nest-red);
  color: var(--nest-red); cursor: pointer; font-family: var(--font);
  font-weight: 600; z-index: 10;
  transition: background 0.15s, color 0.15s;
  display: none;
}
#focus-btn:hover { background: rgba(234,40,69,0.25); color: #fff; }
#focus-btn.visible { display: inline-flex; }
#tab-diagnosis { z-index: 2; background: var(--bg); overflow: hidden; }
#tab-summary { z-index: 2; overflow-y: auto; background: var(--bg); padding: 24px; }

/* ── Sidebar (Graph tab) ── */
#sidebar {
  position: fixed; top: var(--header-h); left: 0; bottom: 0;
  width: 340px;
  background: rgba(17,17,17,0.95);
  border-right: 1px solid var(--border);
  padding: 16px;
  font-size: 12px;
  z-index: 15;
  overflow-y: auto;
  backdrop-filter: blur(8px);
  display: none;
}
#sidebar h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; }
#sidebar .divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
.legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: var(--text); }
.legend-color { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
.legend-line { width: 20px; height: 2px; flex-shrink: 0; }
#sidebar dl { margin: 0; }
#sidebar dt { color: var(--white); font-weight: 600; margin-top: 8px; }
#sidebar dt:first-of-type { margin-top: 0; }
#sidebar dd { color: #999; margin: 2px 0 0 0; line-height: 1.4; }
#sidebar code { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-size: 11px; }

/* ── Detail Panel ── */
#detail {
  position: fixed; top: var(--header-h); right: 0; bottom: 0;
  width: 300px;
  background: rgba(17,17,17,0.95);
  border-left: 1px solid var(--border);
  padding: 16px;
  font-size: 13px;
  z-index: 15;
  display: none;
  overflow-y: auto;
  backdrop-filter: blur(8px);
}
#detail h2 { font-size: 15px; font-weight: 600; color: var(--white); margin-bottom: 4px; }
#detail .filepath { font-size: 11px; color: var(--text-muted); word-break: break-all; margin-bottom: 12px; }
#detail h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin: 10px 0 4px; }
#detail ul { list-style: none; padding: 0; }
#detail li { padding: 2px 0; color: #ccc; font-size: 12px; }
#detail .close-btn {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px;
}
#detail .close-btn:hover { color: var(--white); }

/* ── Focus Hint ── */
#focus-hint {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: rgba(17,17,17,0.95); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px 14px; font-size: 12px; color: var(--text-muted);
  z-index: 15; display: none;
}

/* ── Diagnosis Tab: Two-panel layout ── */
#diagnosis-sidebar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 360px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: rgba(17,17,17,0.95);
  backdrop-filter: blur(8px);
  z-index: 5;
}
#diagnosis-main {
  position: absolute; left: 360px; top: 0; right: 0; bottom: 0;
  overflow-y: auto;
  padding: 24px;
}
.diagnosis-toolbar {
  position: sticky; top: 0; z-index: 5;
  background: rgba(17,17,17,0.95);
  backdrop-filter: blur(8px);
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.filter-rows { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.sev-filters, .scope-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.filter-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  width: 100%;
}
.collapse-all-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); cursor: pointer;
  transition: all 0.15s; flex-shrink: 0; align-self: flex-start;
}
.collapse-all-btn:hover { border-color: var(--border-hover); color: var(--text); }
.collapse-all-btn.all-collapsed { background: rgba(255,255,255,0.08); color: var(--white); border-color: var(--border-hover); }
.sev-pill, .scope-pill {
  font-size: 11px; padding: 4px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); cursor: pointer; font-family: var(--font);
  transition: all 0.15s;
}
.sev-pill:hover, .scope-pill:hover { border-color: var(--border-hover); color: var(--text); }
.sev-pill.active, .scope-pill.active { background: rgba(255,255,255,0.08); color: var(--white); border-color: var(--border-hover); }

/* ── File Tree ── */
.tree-folder, .tree-file { border-bottom: 1px solid rgba(255,255,255,0.03); }
.tree-folder.hidden, .tree-file.hidden { display: none; }

.tree-folder-header, .tree-file-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; cursor: pointer; user-select: none;
  transition: background 0.15s; font-size: 12px;
}
.tree-folder-header:hover, .tree-file-header:hover { background: var(--surface-hover); }

.tree-chevron {
  color: var(--text-dim); font-size: 10px;
  transition: transform 0.15s; flex-shrink: 0; width: 12px; text-align: center;
}
.tree-folder.collapsed .tree-chevron,
.tree-file.collapsed .tree-chevron { transform: rotate(-90deg); }

.tree-folder-icon, .tree-file-icon {
  flex-shrink: 0; color: var(--text-muted); display: flex; align-items: center;
}
.sev-indicator-error { color: var(--sev-error); }
.sev-indicator-warning { color: var(--sev-warning); }
.sev-indicator-info { color: var(--sev-info); }

.tree-folder-name {
  font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
}
.tree-file-name {
  font-weight: 500; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
}

.tree-count {
  font-size: 10px; padding: 1px 7px; border-radius: 10px;
  background: rgba(255,255,255,0.08); color: var(--text-muted); font-weight: 600; flex-shrink: 0;
}

.tree-folder-body { display: block; }
.tree-folder.collapsed .tree-folder-body { display: none; }

.tree-file.active { background: rgba(234,40,69,0.08); border-left: 3px solid var(--nest-red); }

/* Lab: standalone items (project-scope findings with no filePath) */
.pg-standalone-item {
  padding: 8px 14px; cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  display: flex; gap: 8px; align-items: flex-start; font-size: 12px;
}
.pg-standalone-item:hover { background: var(--surface-hover); }
.pg-standalone-item.active { background: rgba(234,40,69,0.08); border-left: 3px solid var(--nest-red); }
.pg-standalone-item .sev-dot {
  width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
}
.pg-standalone-item .finding-msg {
  font-size: 12px; color: var(--text); line-height: 1.4; flex: 1; min-width: 0;
}

/* ── Diagnosis: Empty state ── */
#diagnosis-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted); gap: 12px; text-align: center;
}
#diagnosis-empty-state p { font-size: 14px; color: var(--text-dim); margin: 0; }

/* ── Diagnosis: No issues state ── */
.diagnosis-clean {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted); text-align: center; gap: 8px;
}
.diagnosis-clean p { font-size: 15px; font-weight: 500; color: var(--text); }
.diagnosis-clean span { font-size: 12px; }

/* ── Diagnosis: File view header ── */
#diagnosis-file-header {
  margin-bottom: 20px;
}
#diagnosis-file-header .file-view-title {
  font-size: 15px; font-weight: 600; color: var(--white);
  margin-bottom: 2px;
}
#diagnosis-file-header .file-view-dir {
  font-size: 11px; font-family: monospace; color: var(--text-dim);
  margin-bottom: 8px;
}
#diagnosis-file-header .file-view-counts {
  display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted);
}
#diagnosis-file-header .file-view-counts .fv-count-dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px;
}

/* ── Diagnosis: Unified code viewer container ── */
#diagnosis-file-code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
}
#diagnosis-file-code .cm-editor { background: var(--surface); }
#diagnosis-file-code .cm-scroller { overflow: auto; }
.code-separator-row {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 4px 12px;
  font-size: 12px;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  color: var(--text-dim);
  background: rgba(255,255,255,0.02);
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
  user-select: none;
}

/* ── Diagnosis: Stacked info items below code ── */
#diagnosis-file-info { display: flex; flex-direction: column; }
.diag-info-item {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.diag-info-item:last-child { border-bottom: none; }
.diag-info-item .diag-info-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.diag-info-item .diag-info-header .sev-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.diag-info-item .diag-info-header .code-sev-badge {
  display: inline-block; font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 4px; text-transform: capitalize;
}
.diag-info-item .diag-info-header .code-sev-badge.error {
  background: rgba(239,68,68,0.15); color: var(--sev-error); border: 1px solid rgba(239,68,68,0.25);
}
.diag-info-item .diag-info-header .code-sev-badge.warning {
  background: rgba(245,158,11,0.15); color: var(--sev-warning); border: 1px solid rgba(245,158,11,0.25);
}
.diag-info-item .diag-info-header .code-sev-badge.info {
  background: rgba(59,130,246,0.15); color: var(--sev-info); border: 1px solid rgba(59,130,246,0.25);
}
.diag-info-item .diag-info-header .code-rule-badge {
  display: inline-block; font-size: 11px; font-family: monospace;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); color: var(--text-muted);
  border: 1px solid var(--border);
}
.diag-info-item .diag-info-header .diag-linecol {
  font-size: 11px; font-family: monospace; color: var(--text-dim);
}
.diag-info-item .diag-info-msg {
  font-size: 13px; font-weight: 500; color: var(--text); line-height: 1.5;
  margin-bottom: 4px;
}
.diag-info-item .diag-info-help {
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 8px;
}
.diag-info-item .diag-info-help .section-label {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); margin-bottom: 6px; font-weight: 600;
}
.diag-info-item .diag-info-examples {
  margin-top: 10px;
}
.diag-info-item .diag-info-examples .section-label {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); margin-bottom: 8px; font-weight: 600;
}

/* ── Lab: file view ── */
#pg-file-view { margin-bottom: 16px; }
#pg-file-header { margin-bottom: 16px; }
#pg-file-header .file-view-title {
  font-size: 15px; font-weight: 600; color: var(--white); margin-bottom: 2px;
}
#pg-file-header .file-view-dir {
  font-size: 11px; font-family: monospace; color: var(--text-dim); margin-bottom: 8px;
}
#pg-file-header .file-view-counts {
  display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted);
}
#pg-file-header .file-view-counts .fv-count-dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px;
}
#pg-file-code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
#pg-file-code .cm-editor { background: var(--surface); }
#pg-file-code .cm-scroller { overflow: auto; }
.playground-results .section-label {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); margin-bottom: 8px; font-weight: 600;
}
.examples-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.example-block { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.example-tag {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; padding: 6px 12px; border-bottom: 1px solid var(--border);
}
.example-tag.bad { color: var(--sev-error); background: rgba(239,68,68,0.06); }
.example-tag.good { color: var(--score-green); background: rgba(74,222,128,0.06); }
.example-code {
  background: var(--surface); overflow: hidden;
}
.example-code .cm-gutters { display: none; }
.example-code .cm-editor { background: var(--surface); }
@media (max-width: 900px) { .examples-group { grid-template-columns: 1fr; } }
/* ── Diagnosis: inline expand rows ── */
.code-expand-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px; font-size: 12px;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  color: var(--text-dim); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border-top: 1px solid var(--border);
  transition: background 0.15s, color 0.15s;
  user-select: none;
}
.code-expand-row:first-child { border-top: none; }
.code-expand-row:hover {
  background: rgba(255,255,255,0.06); color: var(--text-muted);
}
.code-expand-row svg { flex-shrink: 0; opacity: 0.5; }
.code-expand-row:hover svg { opacity: 0.8; }

/* ── Diagnosis: Line hover tooltip (wrapper) ── */
.cm-tooltip.cm-tooltip-hover {
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  background: #1a1a1a;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  max-width: 400px;
  overflow: hidden;
  z-index: 9999;
}

/* ── Diagnosis: Line hover tooltip (content) ── */
.cm-line-tooltip {
  padding: 6px 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
}
.cm-line-tooltip-entry {
  display: flex; flex-direction: column; gap: 2px;
  padding: 3px 0;
}
.cm-line-tooltip-entry + .cm-line-tooltip-entry {
  border-top: 1px solid rgba(255,255,255,0.06);
}
.cm-line-tooltip-header {
  display: flex; align-items: center; gap: 6px;
}
.cm-line-tooltip-dot {
  width: 6px; height: 6px; border-radius: 50%;
  flex-shrink: 0;
}
.cm-line-tooltip-rule {
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 11px; color: var(--text-muted);
  background: rgba(255,255,255,0.06);
  padding: 1px 6px; border-radius: 3px;
  flex-shrink: 0; white-space: nowrap;
}
.cm-line-tooltip-msg {
  color: var(--text); line-height: 1.4;
  overflow-wrap: break-word; word-break: break-word;
}

/* ── Diagnosis: no-source fallback ── */
.no-source-msg {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
  margin-bottom: 16px;
}

/* ── Summary Tab ── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.ov-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
}
.ov-card.full-width { grid-column: 1 / -1; }
.ov-card h3 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); margin-bottom: 14px;
}
.ov-score-row {
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
}
.ov-score-ring { flex-shrink: 0; }
.ov-score-details { flex: 1; min-width: 200px; }
.ov-score-label { font-size: 20px; font-weight: 700; color: var(--white); }
.ov-score-sublabel { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.ov-stars { margin-top: 6px; font-size: 16px; letter-spacing: 2px; }
.ov-breakdown {
  display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap;
}
.ov-breakdown-item {
  font-size: 12px; color: var(--text-muted);
  display: flex; align-items: center; gap: 4px;
}
.ov-breakdown-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.ov-info-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
}
.ov-info-item label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); display: block;
}
.ov-info-item span {
  font-size: 14px; color: var(--text); font-weight: 500;
}
.ov-cat-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.ov-cat-row:last-child { border-bottom: none; }
.ov-cat-icon { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.ov-cat-name { font-size: 13px; color: var(--text); flex: 1; }
.ov-cat-count { font-size: 13px; font-weight: 600; color: var(--white); }
.ov-stat-row {
  display: flex; justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.ov-stat-row:last-child { border-bottom: none; }
.ov-stat-label { color: var(--text-muted); }
.ov-stat-value { color: var(--text); font-weight: 500; }

/* ── Lab Tab ── */
#tab-lab {
  z-index: 2; background: var(--bg); overflow: hidden;
  display: none; position: fixed; top: var(--header-h); left: 0; right: 0; bottom: 0;
}
#tab-lab.active { display: flex; }
.playground-editor {
  width: 50%; height: 100%; overflow-y: auto;
  border-right: 1px solid var(--border);
  background: rgba(17,17,17,0.95);
  padding: 20px;
  display: flex; flex-direction: column;
}
.playground-results {
  width: 50%; height: 100%; overflow-y: auto;
  padding: 20px;
  display: flex; flex-direction: column;
}
.playground-section-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); font-weight: 600; margin-bottom: 12px;
  display: flex; align-items: center; gap: 8px;
}
.playground-section-label.playground-title {
  font-size: 14px; letter-spacing: 1px;
}
.playground-subtitle {
  font-size: 12px; color: var(--text-dim); line-height: 1.5;
  margin: -6px 0 14px;
}
.playground-subtitle a {
  color: var(--text-muted); text-decoration: underline;
  text-underline-offset: 2px;
}
.playground-subtitle a:hover {
  color: var(--text);
}
.playground-subtitle code {
  font-size: 11px; background: rgba(255,255,255,0.08); padding: 1px 5px;
  border-radius: 3px; font-family: "SF Mono", "Fira Code", monospace;
  color: var(--text);
}
.playground-section-label span {
  font-size: 10px; padding: 1px 7px; border-radius: 10px;
  background: rgba(255,255,255,0.08); color: var(--text-muted);
  font-weight: 600;
}
.playground-preset {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.playground-preset .playground-field { flex-shrink: 0; }
.playground-preset .playground-field.playground-field-wide { flex: 1; min-width: 0; }
.playground-preset .playground-field select { min-width: 120px; }
.playground-preset-sep {
  width: 1px; height: 24px;
  background: var(--border);
  flex-shrink: 0;
  margin: 0 4px;
}
.playground-form {
  display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 16px;
}
.playground-form-row {
  display: flex; flex-wrap: wrap; gap: 10px; width: 100%;
}
.playground-field { display: flex; flex-direction: column; gap: 4px; }
.playground-field label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); font-weight: 600;
}
.playground-field input,
.playground-field select {
  font-size: 12px; padding: 6px 10px; border-radius: 6px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--border);
  color: var(--text); font-family: var(--font);
  outline: none; min-width: 120px;
}
.playground-field input:focus,
.playground-field select:focus {
  border-color: var(--border-hover);
}
.playground-field-wide { flex: 1; min-width: 200px; }
.playground-field-wide input { width: 100%; }
.pg-cm-wrap {
  flex: 1; min-height: 200px;
  border-radius: 8px; overflow: hidden;
  border: 1px solid var(--border);
}
.pg-cm-wrap:focus-within { border-color: var(--border-hover); }
.pg-context-hint {
  font-size: 10px; color: var(--text-dim); margin-top: 4px;
  font-family: "SF Mono", "Fira Code", monospace;
}
.pg-cm-wrap .cm-editor { height: 100%; background: var(--surface); }
.pg-cm-wrap .cm-scroller {
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.6;
}
.playground-actions {
  display: flex; justify-content: flex-end; margin-top: 12px;
}
#pg-run-btn {
  font-size: 13px; padding: 8px 20px; border-radius: 8px;
  background: rgba(234,40,69,0.15); border: 1px solid var(--nest-red);
  color: var(--nest-red); cursor: pointer; font-family: var(--font);
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}
#pg-run-btn:hover { background: rgba(234,40,69,0.25); color: #fff; }
.playground-error {
  margin-top: 10px; padding: 10px 14px; border-radius: 8px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
  color: var(--sev-error);
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.5; white-space: pre-wrap;
}
.playground-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; color: var(--text-muted); gap: 12px; text-align: center;
}
.playground-empty p { font-size: 14px; color: var(--text-dim); margin: 0; }
#pg-result-list {
  display: flex; flex-direction: column;
}
.pg-result-item {
  padding: 8px 12px; cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  display: flex; gap: 8px; align-items: flex-start;
}
.pg-result-item:hover { background: var(--surface-hover); }
.pg-result-item.active { background: rgba(234,40,69,0.08); border-left: 3px solid var(--nest-red); padding-left: 9px; }
.pg-result-item .sev-dot {
  width: 6px; height: 6px; border-radius: 50%;
  margin-top: 5px; flex-shrink: 0;
}
.pg-result-item .item-content { flex: 1; min-width: 0; }
.pg-result-item .item-msg {
  font-size: 12px; color: var(--text); line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pg-result-item .item-file {
  font-size: 10px; color: var(--text-dim); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.playground-code-body {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.playground-code-body .cm-editor { background: var(--surface); }
.playground-code-body .cm-scroller { overflow: auto; }

@media (max-width: 640px) {
  .summary-grid { grid-template-columns: 1fr; }
  .ov-score-row { flex-direction: column; align-items: flex-start; }
  #detail { width: 100%; }
  #tab-summary { padding: 16px; }
  #diagnosis-sidebar { width: 260px; }
  #diagnosis-main { left: 260px; padding: 16px; }
  #tab-lab { flex-direction: column; }
  .playground-editor { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
  .playground-results { width: 100%; }
}`;
}
