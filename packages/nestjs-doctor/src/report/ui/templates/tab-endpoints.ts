import { closeButton, iconButton } from "../atoms/button.js";
import { emptyState } from "../molecules/empty-state.js";
import { sidebarHeader } from "../molecules/sidebar-header.js";

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
${closeButton({ id: "ep-code-panel-close", classes: "ep-code-panel-close" })}
    </div>
    <div class="ep-code-panel-body" id="ep-code-panel-body"></div>
    <div class="ep-code-panel-resize" id="ep-code-panel-resize"></div>
  </div>
  <div id="endpoints-sidebar">
    <div class="endpoints-sidebar-sticky">
${sidebarHeader({ title: "Endpoints", countId: "endpoints-count", classes: "endpoints-sidebar-header" })}
    </div>
    <div id="endpoints-list"></div>
  </div>
  <div id="endpoints-main">
    <div id="endpoints-canvas-wrap">
${emptyState({ id: "endpoints-empty-state", icon: { name: "activity", size: 48 }, indent: 6, text: "Select an endpoint from the sidebar to view its dependency graph" })}
      <div id="endpoints-toolbar">
${iconButton({ id: "endpoints-recenter", icon: "recenter", modifier: "schema-diagram-btn", title: "Re-center diagram" })}
      </div>
      <canvas id="endpoints-canvas"></canvas>
      <div id="endpoints-tooltip" class="schema-tooltip" style="display:none"></div>
    </div>
  </div>
</div>
`;
