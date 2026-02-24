export function getGraphStyles(): string {
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
#tab-graph { z-index: 1; left: 340px; }
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
#tab-findings { z-index: 2; background: var(--bg); overflow: hidden; }
#tab-overview { z-index: 2; overflow-y: auto; background: var(--bg); padding: 24px; }

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

/* ── Findings Tab: Two-panel layout ── */
#findings-sidebar {
  position: absolute; left: 0; top: 0; bottom: 0; width: 360px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: rgba(17,17,17,0.95);
  backdrop-filter: blur(8px);
  z-index: 5;
}
#findings-main {
  position: absolute; left: 360px; top: 0; right: 0; bottom: 0;
  overflow-y: auto;
  padding: 24px;
}
.findings-toolbar {
  position: sticky; top: 0; z-index: 5;
  background: rgba(17,17,17,0.95);
  backdrop-filter: blur(8px);
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.sev-filters { display: flex; gap: 6px; }
.sev-pill {
  font-size: 11px; padding: 4px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); cursor: pointer; font-family: var(--font);
  transition: all 0.15s;
}
.sev-pill:hover { border-color: var(--border-hover); color: var(--text); }
.sev-pill.active { background: rgba(255,255,255,0.08); color: var(--white); border-color: var(--border-hover); }

.findings-category { border-bottom: 1px solid var(--border); }
.findings-category.hidden { display: none; }
.cat-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  cursor: pointer; user-select: none;
  transition: background 0.15s;
}
.cat-header:hover { background: var(--surface-hover); }
.cat-icon { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.cat-name { font-size: 12px; font-weight: 600; color: var(--white); text-transform: uppercase; letter-spacing: 0.3px; }
.cat-count {
  font-size: 10px; padding: 1px 7px; border-radius: 10px;
  background: rgba(255,255,255,0.08); color: var(--text-muted);
  font-weight: 600;
}
.cat-chevron {
  margin-left: auto; color: var(--text-dim);
  transition: transform 0.2s; font-size: 12px;
}
.findings-category.collapsed .cat-chevron { transform: rotate(-90deg); }
.cat-body { display: block; }
.findings-category.collapsed .cat-body { display: none; }

.findings-rule-item {
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  display: flex; gap: 8px; align-items: flex-start;
}
.findings-rule-item:hover { background: var(--surface-hover); }
.findings-rule-item.active { background: rgba(234,40,69,0.08); border-left: 3px solid var(--nest-red); padding-left: 11px; }
.findings-rule-item.hidden { display: none; }
.findings-rule-item .sev-dot {
  width: 6px; height: 6px; border-radius: 50%;
  margin-top: 5px; flex-shrink: 0;
}
.findings-rule-item .item-content { flex: 1; min-width: 0; }
.findings-rule-item .item-msg {
  font-size: 12px; color: var(--text); line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.findings-rule-item .item-file {
  font-size: 10px; color: var(--text-dim); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Findings: Empty state ── */
#findings-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted); gap: 12px; text-align: center;
}
#findings-empty-state p { font-size: 14px; color: var(--text-dim); margin: 0; }

/* ── Findings: No issues state ── */
.findings-clean {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted); text-align: center; gap: 8px;
}
.findings-clean p { font-size: 15px; font-weight: 500; color: var(--text); }
.findings-clean span { font-size: 12px; }

/* ── Findings: Code viewer ── */
#findings-code-header {
  margin-bottom: 16px;
}
#findings-code-header .code-filepath {
  font-size: 12px; color: var(--text-muted); font-family: monospace;
  margin-bottom: 8px; word-break: break-all;
}
#findings-code-header .code-rule-badge {
  display: inline-block; font-size: 10px; font-family: monospace;
  padding: 2px 8px; border-radius: 3px;
  background: rgba(255,255,255,0.06); color: var(--text-muted);
  margin-right: 6px;
}
#findings-code-header .code-sev-badge {
  display: inline-block; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 3px;
  margin-right: 6px;
}
#findings-code-header .code-sev-badge.error { background: rgba(239,68,68,0.15); color: var(--sev-error); }
#findings-code-header .code-sev-badge.warning { background: rgba(245,158,11,0.15); color: var(--sev-warning); }
#findings-code-header .code-sev-badge.info { background: rgba(59,130,246,0.15); color: var(--sev-info); }
#findings-code-header .code-message {
  font-size: 14px; color: var(--text); margin-top: 10px; line-height: 1.5;
}
#findings-code-body {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 16px;
}
#findings-code-body .code-line {
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 1px 12px 1px 0;
  white-space: pre;
  display: flex;
  line-height: 1.6;
}
#findings-code-body .code-line.highlight {
  background: rgba(234,40,69,0.12);
  border-left: 3px solid var(--nest-red);
}
#findings-code-body .code-line:not(.highlight) {
  border-left: 3px solid transparent;
}
#findings-code-body .line-num {
  display: inline-block;
  width: 48px;
  text-align: right;
  padding-right: 12px;
  color: var(--text-dim);
  user-select: none;
  flex-shrink: 0;
}
#findings-code-body .line-text {
  flex: 1;
}
#findings-code-help {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
#findings-code-help .help-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); margin-bottom: 6px; font-weight: 600;
}
#findings-code-examples { margin-top: 16px; }
#findings-code-examples .examples-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-dim); margin-bottom: 10px; font-weight: 600;
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
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  font-size: 11px; line-height: 1.5; padding: 12px; margin: 0;
  color: var(--text); background: var(--surface); overflow-x: auto; white-space: pre;
}
@media (max-width: 900px) { .examples-group { grid-template-columns: 1fr; } }
/* ── Findings: no-source fallback ── */
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

/* ── Overview Tab ── */
.overview-grid {
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

@media (max-width: 640px) {
  .overview-grid { grid-template-columns: 1fr; }
  .ov-score-row { flex-direction: column; align-items: flex-start; }
  #detail { width: 100%; }
  #tab-overview { padding: 16px; }
  #findings-sidebar { width: 260px; }
  #findings-main { left: 260px; padding: 16px; }
}`;
}
