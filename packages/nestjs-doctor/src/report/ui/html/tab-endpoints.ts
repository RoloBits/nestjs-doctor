import { iconButton } from "../components/button.js";

export const TAB_ENDPOINTS = `
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
${iconButton({ id: "endpoints-recenter", icon: "recenter", modifier: "schema-diagram-btn", title: "Re-center diagram" })}
      </div>
      <canvas id="endpoints-canvas"></canvas>
      <div id="endpoints-tooltip" class="schema-tooltip" style="display:none"></div>
    </div>
  </div>
</div>
`;
