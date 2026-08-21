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
  --cat-schema: #10b981;
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
.tab-btn .beta-badge {
  font-size: 9px; padding: 1px 5px; border-radius: 4px;
  background: rgba(251,191,36,0.15); color: #fbbf24;
  font-weight: 600; line-height: 1.4; text-transform: uppercase; letter-spacing: 0.5px;
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
#tab-modules { z-index: 1; }
#tab-modules.active { display: flex; }
#mg-sidebar {
  width: 340px; min-width: 340px; height: 100%;
  background: var(--surface); border-right: 1px solid var(--border);
  overflow: hidden; padding: 0;
  position: relative;
  display: flex; flex-direction: column;
}
#tab-modules.mg-sidebar-collapsed #mg-sidebar { display: none; }
#mg-resizer { width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent; }
#mg-resizer:hover { background: rgba(59,130,246,0.35); }
body.mg-resizing { cursor: col-resize; user-select: none; }
#tab-modules.mg-sidebar-collapsed #mg-resizer { display: none; }
#mg-sidebar-show { display: none; }
#tab-modules.mg-sidebar-collapsed #mg-sidebar-show {
  display: flex; position: absolute; top: 12px; left: 12px; z-index: 10;
  width: 28px; height: 28px; justify-content: center;
  background: rgba(50,50,50,0.9);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.7);
}
#tab-modules.mg-sidebar-collapsed #mg-sidebar-show:hover {
  background: rgba(70,70,70,0.95); color: #fff;
}
#mg-sidebar-show:is(:hover, :focus-visible)::after { left: 0; right: auto; }
.mg-side-search { padding: 8px 16px 0; }
.mg-side-search input {
  width: 100%; box-sizing: border-box;
  background: rgba(255,255,255,0.05); border: 1px solid var(--border);
  border-radius: 5px; padding: 5px 9px; font-size: 12px; color: var(--text);
  outline: none;
}
.mg-side-search input:focus { border-color: rgba(59,130,246,0.5); }
.mg-toggle-row { display: flex; border-bottom: 1px solid var(--border); }
.mg-toggle-row .schema-sync { padding: 10px 6px 10px 16px; white-space: nowrap; }
#mg-tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.mg-tree-project .st-icon { color: var(--white); }
#mg-main {
  flex: 1; overflow: hidden; background: var(--bg);
  display: flex; flex-direction: column; min-width: 0; position: relative;
}
#mg-wrap { position: relative; flex: 1; overflow: hidden; min-height: 0; }
#graph { position: absolute; top: 0; left: 0; }
#mg-toolbar {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  display: flex; align-items: center; gap: 4px;
}
#mg-empty-state {
  position: absolute; inset: 0; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--text-dim); font-size: 13px;
}
#mg-empty-state.visible { display: flex; }
#tab-diagnosis { z-index: 2; background: var(--bg); overflow: hidden; }
#tab-summary { z-index: 2; overflow-y: auto; background: var(--bg); padding: 24px; }

/* ── Info popover (Graph tab): legend + concepts ── */
#mg-info-pop {
  position: absolute; top: 48px; right: 12px;
  width: 340px; max-height: calc(100% - 60px);
  background: rgba(17,17,17,0.97);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 16px;
  font-size: 12px;
  z-index: 20;
  overflow-y: auto;
  backdrop-filter: blur(8px);
  display: none;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
}
#mg-info-pop.visible { display: block; }
#mg-info-pop h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; }
#mg-info-pop .divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
.legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: var(--text); }
.legend-color { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
.legend-line { width: 20px; height: 2px; flex-shrink: 0; }
#mg-info-pop dl { margin: 0; }
#mg-info-pop dt { color: var(--white); font-weight: 600; margin-top: 8px; }
#mg-info-pop dt:first-of-type { margin-top: 0; }
.concepts-details summary {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); cursor: pointer; user-select: none;
}
.concepts-details summary:hover { color: var(--text); }
.concepts-details[open] summary { margin-bottom: 8px; }
#mg-info-pop dd { color: #999; margin: 2px 0 0 0; line-height: 1.4; }
#mg-info-pop code { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-size: 11px; }

/* ── Bottom dock: problems + boot trace tabs (Graph tab) ── */
#mg-dock {
  border-top: 1px solid var(--border); background: var(--surface);
  flex-shrink: 0; display: flex; flex-direction: column; max-height: 45%;
}
#mg-dock-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; cursor: pointer; user-select: none;
}
#mg-dock-header:hover { background: rgba(255,255,255,0.03); }
.mg-dock-tab {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--text-dim);
  padding: 3px 8px; border-radius: 4px;
}
.mg-dock-tab:hover { color: var(--white); }
#mg-dock[data-active="problems"] #mg-dock-tab-problems,
#mg-dock[data-active="trace"] #mg-dock-tab-trace { color: var(--white); background: rgba(255,255,255,0.06); }
.mg-trace-legend { display: none; font-size: 10px; color: var(--text-dim); }
#mg-dock[data-active="trace"] .mg-trace-legend { display: inline; }
.mg-trace-legend-self {
  display: inline-block; width: 14px; height: 8px; border-radius: 2px;
  background: #fbbf24; vertical-align: middle;
}
#mg-trace-phases { display: none; padding: 8px 14px 2px; border-top: 1px solid var(--border); }
#mg-dock.open[data-active="trace"] #mg-trace-phases { display: block; }
#mg-trace-phases:empty { display: none; }
.mg-phase-strip { display: flex; gap: 2px; height: 10px; margin-bottom: 4px; }
.mg-phase-seg { border-radius: 2px; min-width: 2px; }
#mg-trace-body {
  display: none; overflow-y: auto;
  border-top: 1px solid var(--border); padding: 6px 0;
}
#mg-dock.open[data-active="trace"] #mg-trace-body { display: block; }
.mg-trace-row { display: flex; align-items: center; gap: 10px; padding: 2px 14px; font-size: 11px; }
.mg-trace-label {
  width: 300px; flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  color: #ccc; overflow: hidden; white-space: nowrap;
}
.mg-trace-name { overflow: hidden; text-overflow: ellipsis; }
.mg-trace-track { position: relative; flex: 1; height: 12px; background: rgba(255,255,255,0.03); border-radius: 2px; }
.mg-trace-bar { position: absolute; left: 0; top: 1px; height: 10px; border-radius: 2px; background: rgba(34,211,238,0.35); min-width: 2px; }
.mg-trace-self { position: absolute; top: 1px; height: 10px; border-radius: 2px; background: #fbbf24; }
.mg-trace-time { width: 64px; flex-shrink: 0; text-align: right; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.mg-trace-note { padding: 4px 14px; font-size: 11px; color: var(--text-dim); }
.mg-trace-caret {
  width: 12px; flex-shrink: 0; display: inline-block;
  color: var(--text-dim); transition: transform 0.12s;
}
.mg-trace-row.expanded .mg-trace-caret { transform: rotate(90deg); }
.mg-trace-expandable { cursor: pointer; }
.mg-trace-expandable:hover { background: rgba(255,255,255,0.05); }
.mg-trace-cycle { color: var(--text-dim); }
.mg-trace-reused { opacity: 0.55; }
.mg-trace-reused-tag {
  font-size: 10px; color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px;
}
.mg-trace-hook { font-size: 9px; padding: 0 4px; border-radius: 3px; flex-shrink: 0; }

.mg-problems-chevron {
  color: var(--text-dim); font-size: 12px;
  padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px;
}
#mg-trace-ms:empty { display: none; }
#boot-badge { color: #22d3ee; }
#boot-badge:hover { text-decoration: underline; }
#mg-problems-list { display: none; overflow-y: auto; border-top: 1px solid var(--border); }
#mg-dock.open[data-active="problems"] #mg-problems-list { display: block; }
.mg-problem-row {
  display: flex; align-items: baseline; gap: 8px;
  padding: 4px 14px; font-size: 12px; color: #ccc;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.mg-problem-linked { cursor: pointer; }
.mg-problem-linked:hover { background: rgba(255,255,255,0.04); }
.mg-problem-sev { width: 8px; min-width: 8px; height: 8px; border-radius: 50%; align-self: center; }
.mg-sev-error { background: var(--nest-red); }
.mg-sev-warning { background: #fbbf24; }
.mg-sev-info { background: var(--cat-correctness); }
.mg-problem-msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg-problem-rule { font-size: 10px; color: var(--text-dim); flex-shrink: 0; }
.mg-problem-module { font-size: 10px; color: var(--cat-correctness); flex-shrink: 0; }

/* ── Detail Panel: replaces the tree below the sidebar controls ── */
#detail {
  flex: 1; min-height: 0;
  position: relative;
  background: var(--surface);
  padding: 16px;
  font-size: 13px;
  display: none;
  overflow-y: auto;
}
#mg-sidebar.mg-detail-open #mg-tree { display: none; }
#detail h2 { font-size: 15px; font-weight: 600; color: var(--white); margin-bottom: 4px; padding-right: 20px; word-break: break-word; }
#detail .filepath { font-size: 11px; color: var(--text-muted); word-break: break-all; margin-bottom: 12px; }
#detail h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin: 14px 0 4px; }
#detail ul { list-style: none; padding: 0; }
#detail li { padding: 2px 0; color: #ccc; font-size: 12px; }
#detail .close-btn {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px;
}
#detail .close-btn:hover { color: var(--white); }

/* ── Detail Panel: module badges ── */
#detail-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.md-badge {
  font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 3px;
  text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap;
  background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text-muted);
}
.md-badge.md-global { background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.4); color: #fbbf24; }
.md-badge.md-cycle { background: rgba(234,40,69,0.14); border-color: rgba(234,40,69,0.4); color: var(--nest-red); }
.md-badge.md-root { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.35); color: var(--score-green); }
.md-badge.md-project { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.35); color: var(--cat-correctness); }
.md-badge.md-scope { background: rgba(139,92,246,0.14); border-color: rgba(139,92,246,0.4); color: var(--cat-architecture); }
.md-badge.md-token { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.35); color: var(--cat-schema); }
.md-badge.md-unused { background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.4); color: #fbbf24; cursor: help; }

/* ── Detail Panel: provider and wiring lists ── */
.md-subhead {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); margin: 8px 0 2px;
}
.md-subhead:first-child { margin-top: 2px; }
.md-subcount { font-weight: 400; color: var(--text-dim); }
.md-group { padding-left: 12px; }
/* Kind colors: services blue, repositories green, modules amber. */
.md-subhead.md-kind-service, .md-row-name.md-kind-service { color: #60a5fa; }
.md-subhead.md-kind-repo, .md-row-name.md-kind-repo { color: #34d399; }
.md-row-name.md-kind-module, .md-kind-module { color: #fbbf24; }
.md-badge.md-module { background: rgba(251,191,36,0.14); border-color: rgba(251,191,36,0.4); color: #fbbf24; }
.md-badge.md-ext { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.18); color: var(--text-muted); }
#tab-modules.mg-ext-hidden .md-import-ext { display: none; }
.md-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; padding: 2px 0; font-size: 12px; color: #ccc; }
.md-row-name { min-width: 0; overflow-wrap: anywhere; }
.md-badge.md-use {
  background: rgba(139,92,246,0.14); border-color: rgba(139,92,246,0.4); color: var(--cat-architecture);
  text-transform: none; white-space: normal; overflow-wrap: anywhere; max-width: 100%; text-align: left;
}
.md-empty { font-size: 11px; color: var(--text-dim); font-style: italic; padding: 2px 0; }
.md-note { font-size: 10px; color: var(--text-dim); line-height: 1.4; margin: 2px 0 6px; }

.md-ctrl {
  margin: 6px 0; padding: 6px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.03); border: 1px solid var(--border);
}
.md-ctrl-name { font-size: 12px; font-weight: 600; color: var(--white); margin-bottom: 4px; }
.md-ep { margin: 4px 0 2px; font-size: 11px; }
.md-verb {
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px;
  margin-right: 5px; letter-spacing: 0.3px;
  background: rgba(59,130,246,0.15); color: var(--cat-correctness);
}
.md-verb.md-post { background: rgba(74,222,128,0.15); color: var(--score-green); }
.md-verb.md-put, .md-verb.md-patch { background: rgba(245,158,11,0.15); color: var(--cat-performance); }
.md-verb.md-delete { background: rgba(239,68,68,0.15); color: var(--sev-error); }
.md-verb.md-verb-multi { background: rgba(255,255,255,0.08); color: var(--text-muted); }
.md-route { font-family: monospace; font-size: 11px; color: var(--text); overflow-wrap: anywhere; }
.md-tree { list-style: none; padding: 0; margin: 2px 0 0; }
.md-tree li { padding: 1px 0; font-size: 11px; color: #bbb; }
.md-tree-row { display: flex; align-items: baseline; gap: 4px; }
.md-tree-elbow { color: #555; flex-shrink: 0; }
.md-tree-label { min-width: 0; overflow-wrap: anywhere; }
.md-endpoint > summary { list-style: none; cursor: pointer; }
.md-endpoint > summary::-webkit-details-marker { display: none; }
.md-ctrl-details > summary { list-style: none; cursor: pointer; }
.md-ctrl-details > summary::-webkit-details-marker { display: none; }
.md-ctrl-details[open] > summary .md-ep-caret { transform: rotate(90deg); }
.md-ctrl-details > summary:hover .md-ep-caret { color: var(--text); }
.md-ep-caret { display: inline-block; color: var(--text-dim); font-size: 10px; margin-right: 4px; transition: transform 0.12s; }
.md-endpoint[open] > .md-ep .md-ep-caret, .md-endpoint[open] > summary .md-ep-caret { transform: rotate(90deg); }
.md-endpoint > summary:hover .md-ep-caret { color: var(--text); }
.md-dep-type {
  font-size: 9px; padding: 0 4px; border-radius: 3px; margin-left: 5px;
  background: rgba(255,255,255,0.06); color: var(--text-dim);
}
.md-dep-type.md-t-service { background: rgba(59,130,246,0.14); color: var(--cat-correctness); }
.md-dep-type.md-t-repository { background: rgba(16,185,129,0.14); color: var(--cat-schema); }
.md-dep-type.md-t-guard { background: rgba(239,68,68,0.14); color: var(--sev-error); }
.md-more {
  background: none; border: none; padding: 1px 0; cursor: pointer;
  font-family: var(--font); font-size: 10px; color: var(--cat-correctness);
}
.md-more:hover { text-decoration: underline; }
.md-hidden { display: none; }

/* ── Detail Panel: blast radius ── */
.md-blast-headline { font-size: 12px; color: var(--text); margin-bottom: 4px; }
.md-blast-headline strong { color: var(--white); }
.md-blast-row { display: flex; align-items: center; gap: 8px; font-size: 11px; padding: 2px 0; color: #bbb; }
.md-blast-pill {
  min-width: 22px; box-sizing: border-box; text-align: center;
  background: rgba(255,255,255,0.07); border: 1px solid var(--border);
  border-radius: 9px; padding: 0 6px; font-size: 10px; color: var(--text);
  flex-shrink: 0;
}
.has-tip.tip-list:is(:hover, :focus-visible)::after {
  white-space: pre-line; width: max-content; max-width: 260px;
  left: 0; right: auto; text-align: left; line-height: 1.5;
  text-transform: none; letter-spacing: normal; font-weight: 400;
}
.md-blast-proj { min-width: 0; overflow-wrap: anywhere; }
.md-blast-proj-details > summary { list-style: none; cursor: pointer; }
.md-blast-proj-details > summary::-webkit-details-marker { display: none; }
.md-blast-proj-details[open] > summary .md-ep-caret { transform: rotate(90deg); }
.md-blast-mods { list-style: none; padding: 2px 0 2px 34px; margin: 0; font-size: 11px; color: #bbb; }
.md-blast-mods li { padding: 1px 0; overflow-wrap: anywhere; }
.md-blast-hidden { display: none; }
.md-cycle-row {
  color: var(--nest-red); font-size: 12px; padding: 2px 4px; margin-left: -4px;
  border-radius: 4px; cursor: pointer; overflow-wrap: anywhere; position: relative;
}
.md-cycle-row:hover { background: rgba(234,40,69,0.12); }
.md-import-row, .md-usedby-row { cursor: default; border-radius: 4px; padding: 1px 4px; margin-left: -4px; position: relative; }
.md-import-row:hover, .md-usedby-row:hover { background: rgba(255,255,255,0.06); }
/* Badge tips anchor to the row for full-width rendering. */
.md-badge.badge-tip { position: static; }
.md-blast-count { color: var(--text-dim); font-size: 10px; }
.has-tip.tip-right:is(:hover, :focus-visible)::after { left: 0; right: auto; }
.md-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-family: var(--font); font-size: 12px; color: #ccc; text-align: left;
}
.md-link:hover { color: var(--white); text-decoration: underline; }

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

/* ── Schema tab ── */
#tab-schema { display: none; position: fixed; top: var(--header-h); left: 0; right: 0; bottom: 0; }
#tab-schema.active { display: flex; }
#schema-sidebar {
  width: 340px; min-width: 340px; height: 100%;
  background: var(--surface); border-right: 1px solid var(--border);
  overflow-y: auto; padding: 0;
}
.schema-sidebar-sticky {
  position: sticky; top: 0; z-index: 1; background: var(--surface);
}
.schema-sidebar-header {
  padding: 16px 16px 12px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border);
}
.schema-sidebar-title { font-weight: 600; font-size: 13px; color: var(--white); }
.st-btn {
  background: none; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; padding: 2px 4px; cursor: pointer;
  color: var(--text-dim); display: flex; align-items: center;
}
.st-btn:hover { background: rgba(255,255,255,0.08); color: var(--white); }
.st-btn svg { width: 16px; height: 16px; }
.schema-entity-count {
  font-size: 11px; color: var(--text-muted); background: rgba(255,255,255,0.06);
  padding: 1px 7px; border-radius: 10px;
}
.schema-disclaimer {
  font-size: 10px; color: var(--text-dim); padding: 8px 16px;
  border-bottom: 1px solid var(--border); line-height: 1.4;
}
#schema-entity-list { padding: 4px 0; }
.st-row {
  display: flex; align-items: center; padding: 3px 12px 3px 0; cursor: pointer;
  line-height: 20px; font-size: 12px; white-space: nowrap;
}
.st-row:hover { background: rgba(255,255,255,0.04); }
.st-row.st-selected { background: rgba(59,130,246,0.18); }
.st-toggle {
  width: 16px; min-width: 16px; text-align: center; font-size: 10px;
  color: var(--text-dim); user-select: none;
}
.st-indent { width: 16px; min-width: 16px; }
.st-icon {
  width: 18px; min-width: 18px; height: 18px; display: flex;
  align-items: center; justify-content: center; margin-right: 4px;
}
.st-icon svg { width: 14px; height: 14px; }
.st-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
.st-entity-name { font-weight: 600; color: var(--white); }
.st-group-name { color: var(--text-muted); font-weight: 500; }
.st-count {
  font-size: 10px; color: var(--text-dim); margin-left: 6px;
  opacity: 0.7; flex-shrink: 0;
}
.st-col-type {
  font-size: 11px; color: var(--cat-correctness); font-family: monospace;
  margin-left: 6px; flex-shrink: 0;
}
.st-rel-type {
  font-size: 9px; font-weight: 600; color: var(--cat-architecture);
  background: rgba(139,92,246,0.1); padding: 1px 5px; border-radius: 3px;
  margin-left: 6px; font-family: monospace; flex-shrink: 0;
}
.st-col-default {
  font-size: 10px; color: var(--text-dim); margin-left: 4px;
  font-family: monospace; max-width: 120px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: inline-block; vertical-align: middle; flex-shrink: 0;
}
.st-col-tags {
  font-size: 9px; color: var(--cat-architecture);
  margin-left: 6px; opacity: 0.7; flex-shrink: 0;
}
.st-children { display: none; }
.st-open { display: block; }

#schema-main {
  flex: 1; overflow: hidden; background: var(--bg);
  display: flex; flex-direction: column; min-width: 0;
}
#schema-canvas-wrap {
  flex: 1; overflow: hidden; position: relative; min-height: 0;
}
#schema-canvas {
  position: absolute; top: 0; left: 0;
  cursor: grab; display: block;
}
#schema-canvas:active { cursor: grabbing; }
#schema-toolbar {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  display: flex; align-items: center; gap: 4px;
}
#tab-schema.sidebar-collapsed #schema-sidebar { display: none; }
#schema-sidebar-show { display: none; }
#tab-schema.sidebar-collapsed #schema-sidebar-show {
  display: flex; position: absolute; top: 12px; left: 12px; z-index: 10;
  width: 28px; height: 28px; justify-content: center;
  background: rgba(50,50,50,0.9);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.7);
}
#tab-schema.sidebar-collapsed #schema-sidebar-show:hover {
  background: rgba(70,70,70,0.95); color: #fff;
}
#schema-sidebar-show:is(:hover, :focus-visible)::after { left: 0; right: auto; }
.schema-sync {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px; cursor: pointer;
  font-size: 11px; color: var(--text-dim); user-select: none;
}
.schema-sync:hover { color: var(--text); }
.schema-sync input { accent-color: var(--nest-red); cursor: pointer; margin: 0; }
.schema-sync:is(:hover, :focus-visible)::after { left: 16px; right: auto; }
.has-tip { position: relative; }
.has-tip:is(:hover, :focus-visible)::after {
  content: attr(data-tip);
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
  white-space: nowrap; pointer-events: none;
  background: #1a1a1a; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px; padding: 4px 8px;
  font-size: 11px; font-family: var(--font); color: var(--text);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
#schema-sidebar .has-tip:is(:hover, :focus-visible)::after {
  white-space: normal; width: max-content; max-width: 240px;
}
.md-info {
  display: inline-flex; vertical-align: -2px; color: var(--text-dim);
}
.md-info svg { width: 12px; height: 12px; }
.md-info:hover { color: var(--text); }
.has-tip.tip-wide:is(:hover, :focus-visible)::after {
  white-space: normal; width: max-content; max-width: 100%;
  box-sizing: border-box;
  left: 0; right: auto; text-transform: none; letter-spacing: normal;
  font-weight: 400; line-height: 1.4;
}
/* An icon sits near the left edge, so its tip has to open rightwards. */
.st-icon.has-tip:is(:hover, :focus-visible)::after { left: 0; right: auto; top: calc(100% + 2px); }
.schema-diagram-btn {
  width: 28px; height: 28px; justify-content: center;
  background: rgba(50,50,50,0.9);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.7);
}
.schema-diagram-btn:hover {
  background: rgba(70,70,70,0.95);
  border-color: rgba(255,255,255,0.35);
  color: #fff;
}
.schema-diagram-btn.active {
  background: rgba(234,40,69,0.22);
  border-color: rgba(234,40,69,0.7);
  color: #fff;
}
#schema-zoombar, #mg-zoombar {
  display: flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; border-radius: 6px;
  background: rgba(50,50,50,0.9);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.22);
}
.schema-zoom-btn {
  width: 20px; height: 20px; justify-content: center; padding: 0;
  background: none; border: none; color: rgba(255,255,255,0.7);
}
.schema-zoom-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
.schema-zoom-btn svg { width: 14px; height: 14px; }
#schema-zoom-range, #mg-zoom-range {
  -webkit-appearance: none; appearance: none;
  width: 110px; height: 3px; border-radius: 2px;
  background: rgba(255,255,255,0.25); outline: none; cursor: pointer;
}
#schema-zoom-range::-webkit-slider-thumb, #mg-zoom-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 11px; height: 11px; border-radius: 50%;
  background: var(--nest-red); cursor: pointer;
}
#schema-zoom-range::-moz-range-thumb, #mg-zoom-range::-moz-range-thumb {
  width: 11px; height: 11px; border: none; border-radius: 50%;
  background: var(--nest-red); cursor: pointer;
}
.schema-zoom-value {
  min-width: 38px; text-align: right; cursor: pointer;
  font-size: 11px; font-family: var(--font); color: rgba(255,255,255,0.7);
  background: none; border: none; padding: 0;
}
.schema-zoom-value:hover { color: #fff; }
.schema-tooltip {
  position: absolute; z-index: 20; pointer-events: none;
  background: #1a1a1a; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; padding: 8px 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  max-width: 280px; font-size: 12px; color: var(--text);
  font-family: var(--font);
}
.schema-tooltip .tt-name { font-weight: 600; color: var(--white); margin-bottom: 2px; font-size: 13px; }
.schema-tooltip .tt-table { font-size: 10px; color: var(--text-dim); margin-bottom: 6px; }
.schema-tooltip .tt-cols { margin: 0; padding: 0; list-style: none; }
.schema-tooltip .tt-cols li { padding: 1px 0; display: flex; gap: 6px; font-size: 11px; }
.schema-tooltip .tt-cols li .col-name { color: var(--text); }
.schema-tooltip .tt-cols li .col-type { color: var(--text-dim); font-family: monospace; font-size: 10px; }
.schema-tooltip .tt-size { margin-top: 4px; font-size: 10px; color: var(--text-dim); }
.schema-size-badge { color: var(--text-dim); }
.schema-rel-badge {
  position: absolute; z-index: 20; pointer-events: none;
  background: #1a1a1a; border: 1px solid rgba(255,255,255,0.25);
  border-radius: 6px; padding: 6px 10px;
  box-shadow: 0 0 8px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.5);
  font-size: 11px; color: var(--text); font-family: var(--font);
  white-space: nowrap;
}
.schema-rel-badge .rb-type {
  font-weight: 600; color: var(--white); margin-right: 6px;
}
.schema-rel-badge .rb-arrow { color: var(--text-dim); margin: 0 4px; }
#schema-empty-state {
  display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  flex-direction: column; align-items: center; justify-content: center;
  color: var(--text-muted); gap: 12px; text-align: center; z-index: 5;
}
#schema-empty-state p { font-size: 14px; color: var(--text-dim); margin: 0; }
.schema-empty-action {
  padding: 6px 14px; font-size: 12px; font-family: var(--font);
  color: var(--text); border-color: rgba(255,255,255,0.18);
}
.schema-empty-action:hover { color: var(--white); }

/* ── Schema diagnostics panel ── */
#schema-diag-panel {
  flex: none; border-top: 1px solid var(--border); background: var(--surface);
}
#schema-diag-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; cursor: pointer; user-select: none;
  transition: background 0.15s;
}
#schema-diag-header:hover { background: var(--surface-hover); }
.schema-diag-chevron {
  color: var(--text-dim); flex-shrink: 0;
  transition: transform 0.15s;
}
.schema-diag-chevron.open { transform: rotate(90deg); }
.schema-diag-title {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
  font-weight: 600; color: var(--text-muted);
}
.schema-diag-count {
  font-size: 10px; padding: 1px 7px; border-radius: 10px;
  font-weight: 600; line-height: 1.4;
  background: rgba(74,222,128,0.15); color: var(--score-green);
}
.schema-diag-count.has-issues {
  background: rgba(239,68,68,0.15); color: var(--sev-error);
}
#schema-diag-body {
  max-height: 220px; overflow-y: auto;
  border-top: 1px solid var(--border);
}
.sd-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 12px; font-size: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.sd-item:last-child { border-bottom: none; }
.sd-item .sev-dot {
  width: 6px; height: 6px; border-radius: 50%;
  margin-top: 5px; flex-shrink: 0;
}
.sd-rule {
  font-size: 10px; font-family: "SF Mono", "Fira Code", monospace;
  color: var(--text-dim); background: rgba(255,255,255,0.06);
  padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
  white-space: nowrap;
}
.sd-entity {
  color: var(--cat-schema); cursor: pointer; font-weight: 500;
  text-decoration: underline; text-underline-offset: 2px;
  flex-shrink: 0;
}
.sd-entity:hover { color: #34d399; }
.sd-msg { color: var(--text); line-height: 1.4; flex: 1; min-width: 0; }
.sd-empty {
  display: flex; align-items: center; justify-content: center;
  padding: 16px; color: var(--text-dim); font-size: 12px;
}

/* ── Endpoints tab ── */
#tab-endpoints { display: none; position: fixed; top: var(--header-h); left: 0; right: 0; bottom: 0; }
#tab-endpoints.active { display: flex; }
#endpoints-sidebar {
  width: 340px; min-width: 340px; height: 100%;
  background: var(--surface); border-right: 1px solid var(--border);
  overflow-y: auto; padding: 0;
}
.endpoints-sidebar-sticky {
  position: sticky; top: 0; z-index: 1; background: var(--surface);
}
.endpoints-sidebar-header {
  padding: 16px 16px 12px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border);
}
#endpoints-list { padding: 4px 0; }
#endpoints-main {
  flex: 1; overflow: hidden; background: var(--bg);
  display: flex; flex-direction: column; min-width: 0;
}
#endpoints-canvas-wrap {
  flex: 1; overflow: hidden; position: relative; min-height: 0;
}
#endpoints-canvas {
  position: absolute; top: 0; left: 0;
  cursor: grab; display: block;
}
#endpoints-canvas:active { cursor: grabbing; }
#endpoints-toolbar {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  display: flex; gap: 4px;
}
#endpoints-empty-state {
  display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  flex-direction: column; align-items: center; justify-content: center;
  color: var(--text-muted); gap: 12px; text-align: center; z-index: 5;
}
#endpoints-empty-state p { font-size: 14px; color: var(--text-dim); margin: 0; }
.ep-method-badge {
  display: inline-block; font-size: 9px; font-weight: 700;
  padding: 1px 6px; border-radius: 3px; margin-right: 6px;
  text-transform: uppercase; letter-spacing: 0.5px;
  min-width: 36px; text-align: center;
}
.ep-method-get { background: rgba(59,130,246,0.15); color: #3b82f6; }
.ep-method-post { background: rgba(16,185,129,0.15); color: #10b981; }
.ep-method-put { background: rgba(245,158,11,0.15); color: #f59e0b; }
.ep-method-patch { background: rgba(245,158,11,0.15); color: #f59e0b; }
.ep-method-delete { background: rgba(239,68,68,0.15); color: #ef4444; }
.ep-endpoint-row { padding-left: 4px; }
.ep-endpoint-row:hover { background: rgba(255,255,255,0.04); }
.ep-endpoint-row.st-selected { background: rgba(59,130,246,0.18); }

/* ── Endpoint code panel ── */
.ep-code-panel {
  position: absolute; left: 0; top: 0; bottom: 0; width: 500px; z-index: 10;
  background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  transform: translateX(-100%); transition: transform 0.25s ease;
}
.ep-code-panel.open { transform: translateX(0); }
.ep-code-panel-header {
  padding: 14px 16px 10px; border-bottom: 1px solid var(--border);
  position: relative; flex-shrink: 0;
}
.ep-code-panel-title {
  display: flex; align-items: center; gap: 4px;
  font-size: 14px; font-weight: 600; color: var(--white);
  margin-bottom: 4px;
}
.ep-code-panel-method { color: var(--text-muted); font-weight: 400; }
.ep-code-panel-path {
  font-size: 11px; font-family: monospace; color: var(--text-dim);
  word-break: break-all;
}
.ep-code-panel-close {
  position: absolute; top: 10px; right: 12px;
  background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 20px; line-height: 1;
}
.ep-code-panel-close:hover { color: var(--white); }
.ep-code-panel-body {
  flex: 1; overflow-y: auto;
}
.ep-code-panel-body .cm-editor { background: var(--surface); }
.ep-code-panel-body .cm-scroller { overflow: auto; }
.ep-code-no-source {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: var(--text-dim); font-size: 13px; text-align: center;
  padding: 24px;
}
.ep-code-panel-resize {
  position: absolute; right: -2px; top: 0; bottom: 0; width: 5px;
  cursor: col-resize; z-index: 11;
  background: transparent;
  transition: background 0.15s;
}
.ep-code-panel-resize:hover,
.ep-code-panel-resize.dragging {
  background: var(--nest-red);
}

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
  #schema-sidebar { width: 260px; min-width: 260px; }
  #endpoints-sidebar { width: 260px; min-width: 260px; }
  .ep-code-panel { width: 100%; }
}`;
}
