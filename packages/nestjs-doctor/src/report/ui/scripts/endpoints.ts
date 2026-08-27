export const ENDPOINTS = `
// ── Endpoints tab: Canvas-based dependency graph ──

var epCanvas, epCtx, epDpr, epW, epH;
var epCamX = 0, epCamY = 0, epZoom = 1;
var epDragging = null, epPanning = false, epPanStart = {x: 0, y: 0};
var epDragMoved = false;
var epHoveredNode = null;
var epNodes = [];
var epEdges = [];
var epTooltipEl = null;
var epDirty = false;
var epSelectedEndpoint = null;

var EP_TYPE_COLORS = {
  controller: "#ea2845",
  service: "#3b82f6",
  repository: "#10b981",
  guard: "#f59e0b",
  interceptor: "#8b5cf6",
  pipe: "#14b8a6",
  filter: "#ef4444",
  gateway: "#ec4899",
  step: "#64748b",
  throw: "#f87171",
  unknown: "#666"
};

function epScheduleRedraw() {
  if (!epDirty) {
    epDirty = true;
    requestAnimationFrame(function() { epDirty = false; epDraw(); });
  }
}

function epScreenToWorld(sx, sy) {
  return {
    x: (sx - epW / 2) / epZoom + epW / 2 - epCamX,
    y: (sy - epH / 2) / epZoom + epH / 2 - epCamY
  };
}

function epHitTest(wx, wy) {
  for (var i = epNodes.length - 1; i >= 0; i--) {
    var n = epNodes[i];
    if (wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 &&
        wy >= n.y - n.h / 2 && wy <= n.y + n.h / 2) return n;
  }
  return null;
}

function epRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function epBuildGraph(ep) {
  epNodes = [];
  epEdges = [];
  var nodeId = 0;

  // Root node for the endpoint (controller method)
  var rootNode = {
    id: nodeId++,
    className: ep.controllerClass,
    type: "controller",
    methodName: ep.handlerMethod,
    conditional: false,
    order: -1,
    totalMethods: 1,
    filePath: ep.filePath,
    line: ep.line,
    x: 0, y: 0, w: 180, h: 60
  };
  epNodes.push(rootNode);

  // Walk dependency tree — each dep is a MethodDependencyNode (one method per node)
  function walkDeps(parentNode, deps) {
    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      var n = {
        id: nodeId++,
        className: dep.className,
        type: dep.type,
        methodName: dep.methodName,
        conditional: dep.conditional,
        order: dep.order,
        totalMethods: dep.totalMethods,
        filePath: dep.filePath,
        line: dep.line,
        expandedElsewhere: dep.expandedElsewhere,
        x: 0, y: 0, w: 180, h: 60
      };
      epNodes.push(n);
      epEdges.push({ from: parentNode.id, to: n.id, conditional: dep.conditional });
      if (dep.dependencies && dep.dependencies.length > 0) {
        walkDeps(n, dep.dependencies);
      }
    }
  }

  walkDeps(rootNode, ep.dependencies);
}

function epLayout() {
  if (epNodes.length === 0) return;

  if (typeof dagre !== "undefined") {
    var g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80, marginx: 40, marginy: 40 });
    g.setDefaultEdgeLabel(function() { return {}; });

    for (var i = 0; i < epNodes.length; i++) {
      g.setNode(epNodes[i].id, { width: epNodes[i].w, height: epNodes[i].h });
    }
    for (var i = 0; i < epEdges.length; i++) {
      g.setEdge(epEdges[i].from, epEdges[i].to);
    }

    dagre.layout(g);

    for (var i = 0; i < epNodes.length; i++) {
      var laid = g.node(epNodes[i].id);
      if (laid) {
        epNodes[i].x = laid.x;
        epNodes[i].y = laid.y;
      }
    }
  } else {
    // Fallback: simple vertical layout
    for (var i = 0; i < epNodes.length; i++) {
      epNodes[i].x = 300;
      epNodes[i].y = 60 + i * 100;
    }
  }
}

function epCenterCamera() {
  if (epNodes.length === 0) return;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < epNodes.length; i++) {
    var n = epNodes[i];
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  var graphW = maxX - minX;
  var graphH = maxY - minY;
  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;

  var pad = 60;
  var scaleX = (epW - pad * 2) / (graphW || 1);
  var scaleY = (epH - pad * 2) / (graphH || 1);
  epZoom = Math.min(scaleX, scaleY, 1.5);
  epZoom = Math.max(epZoom, 0.3);

  epCamX = epW / 2 - cx;
  epCamY = epH / 2 - cy;
}

function epDraw() {
  if (!epCtx) return;
  epCtx.save();
  epCtx.clearRect(0, 0, epW, epH);

  if (epNodes.length === 0) {
    epCtx.restore();
    return;
  }

  epCtx.translate(epW / 2, epH / 2);
  epCtx.scale(epZoom, epZoom);
  epCtx.translate(-epW / 2 + epCamX, -epH / 2 + epCamY);

  // Build node lookup by id
  var nodeById = {};
  for (var i = 0; i < epNodes.length; i++) nodeById[epNodes[i].id] = epNodes[i];

  // Draw edges
  for (var i = 0; i < epEdges.length; i++) {
    var fromN = nodeById[epEdges[i].from];
    var toN = nodeById[epEdges[i].to];
    if (!fromN || !toN) continue;

    var fx = fromN.x;
    var fy = fromN.y + fromN.h / 2;
    var tx = toN.x;
    var ty = toN.y - toN.h / 2;

    var edgeColor = epEdges[i].conditional ? "rgba(245, 158, 11, 0.6)" : "#555";
    if (epEdges[i].conditional) {
      epCtx.setLineDash([6 / epZoom, 4 / epZoom]);
    }

    epCtx.beginPath();
    epCtx.moveTo(fx, fy);
    // L-shaped edge if not aligned
    if (Math.abs(fx - tx) > 2) {
      var midY = fy + (ty - fy) / 2;
      epCtx.lineTo(fx, midY);
      epCtx.lineTo(tx, midY);
    }
    epCtx.lineTo(tx, ty);
    epCtx.strokeStyle = edgeColor;
    epCtx.lineWidth = 1.5 / epZoom;
    epCtx.stroke();

    // Arrow
    var arrowSize = 5 / epZoom;
    epCtx.beginPath();
    epCtx.moveTo(tx - arrowSize, ty - arrowSize);
    epCtx.lineTo(tx, ty);
    epCtx.lineTo(tx + arrowSize, ty - arrowSize);
    epCtx.strokeStyle = edgeColor;
    epCtx.lineWidth = 1.5 / epZoom;
    epCtx.stroke();

    epCtx.setLineDash([]);
  }

  // Draw nodes
  var BOX_R = 6;
  var HDR_H = 22;

  for (var i = 0; i < epNodes.length; i++) {
    var n = epNodes[i];
    var x = n.x - n.w / 2;
    var y = n.y - n.h / 2;
    var color = EP_TYPE_COLORS[n.type] || EP_TYPE_COLORS.unknown;
    var isHovered = (epHoveredNode && epHoveredNode.id === n.id);

    var isCond = n.conditional;
    var headerColor = isCond ? "#f59e0b" : color;

    // Shadow
    if (isHovered) {
      epCtx.save();
      epCtx.shadowColor = "rgba(255,255,255,0.2)";
      epCtx.shadowBlur = 10;
    }

    // Body
    epRoundRect(epCtx, x, y, n.w, n.h, BOX_R);
    epCtx.fillStyle = "#151515";
    epCtx.fill();
    if (isCond) {
      epCtx.setLineDash([4 / epZoom, 3 / epZoom]);
      epCtx.strokeStyle = isHovered ? "#f59e0b" : "rgba(245,158,11,0.5)";
    } else {
      epCtx.strokeStyle = isHovered ? "#ffffff" : "rgba(255,255,255,0.06)";
    }
    epCtx.lineWidth = isHovered ? 2 : 1;
    epCtx.stroke();
    epCtx.setLineDash([]);

    if (isHovered) epCtx.restore();

    // Colored header bar
    epCtx.save();
    epCtx.beginPath();
    epCtx.moveTo(x + BOX_R, y);
    epCtx.lineTo(x + n.w - BOX_R, y);
    epCtx.quadraticCurveTo(x + n.w, y, x + n.w, y + BOX_R);
    epCtx.lineTo(x + n.w, y + HDR_H);
    epCtx.lineTo(x, y + HDR_H);
    epCtx.lineTo(x, y + BOX_R);
    epCtx.quadraticCurveTo(x, y, x + BOX_R, y);
    epCtx.closePath();
    epCtx.clip();
    epCtx.fillStyle = headerColor;
    epCtx.globalAlpha = isCond ? 0.12 : 0.15;
    epCtx.fillRect(x, y, n.w, HDR_H);
    epCtx.globalAlpha = 1;
    epCtx.restore();

    // Separator
    epCtx.beginPath();
    epCtx.moveTo(x + 1, y + HDR_H);
    epCtx.lineTo(x + n.w - 1, y + HDR_H);
    epCtx.strokeStyle = "rgba(255,255,255,0.06)";
    epCtx.lineWidth = 1;
    epCtx.stroke();

    // Color dot
    var dotSize = 6;
    epCtx.fillStyle = headerColor;
    epCtx.fillRect(x + 8, y + HDR_H / 2 - dotSize / 2, dotSize, dotSize);

    // Class name
    epCtx.fillStyle = "#e0e0e0";
    epCtx.font = "bold 11px " + RPT_FONT;
    epCtx.textAlign = "left";
    epCtx.textBaseline = "middle";
    var nameStr = n.className;
    var nameStartX = x + 8 + dotSize + 6;
    var maxNameW = n.w - (nameStartX - x) - 8;
    while (epCtx.measureText(nameStr).width > maxNameW && nameStr.length > 3) {
      nameStr = nameStr.slice(0, -1);
    }
    if (nameStr !== n.className) nameStr += "\\u2026";
    epCtx.fillText(nameStr, nameStartX, y + HDR_H / 2);

    // Below header: type badge + order badge + method name
    var infoY = y + HDR_H + 8;

    // Type badge
    epCtx.font = "bold 9px " + RPT_FONT;
    var typeLabel = n.type.toUpperCase();
    var badgeW = epCtx.measureText(typeLabel).width + 10;
    epRoundRect(epCtx, x + 8, infoY - 1, badgeW, 14, 3);
    epCtx.fillStyle = color;
    epCtx.globalAlpha = 0.15;
    epCtx.fill();
    epCtx.globalAlpha = 1;
    epCtx.fillStyle = color;
    epCtx.textAlign = "left";
    epCtx.textBaseline = "middle";
    epCtx.fillText(typeLabel, x + 13, infoY + 6);

    // Order badge (#N)
    var badgeRight = x + 8 + badgeW;
    var orderW = 0;
    if (n.order >= 0) {
      var orderLabel = "#" + (n.order + 1);
      epCtx.font = "bold 8px " + RPT_FONT;
      orderW = epCtx.measureText(orderLabel).width + 8;
      epRoundRect(epCtx, badgeRight + 4, infoY, orderW, 12, 3);
      epCtx.fillStyle = "rgba(255,255,255,0.08)";
      epCtx.fill();
      epCtx.fillStyle = "#999";
      epCtx.textBaseline = "middle";
      epCtx.fillText(orderLabel, badgeRight + 8, infoY + 6);
    }

    // Repeat marker, right-aligned so it fits whatever the type badge is wide
    if (n.expandedElsewhere) {
      epCtx.font = "bold 10px " + RPT_FONT;
      epCtx.fillStyle = "#888";
      epCtx.textAlign = "right";
      epCtx.textBaseline = "middle";
      epCtx.fillText("\u21B1", x + n.w - 8, infoY + 6);
      epCtx.textAlign = "left";
    }

    // Method name
    if (n.methodName) {
      var methodY = infoY + 18;
      epCtx.font = "9px " + RPT_FONT;
      epCtx.textAlign = "left";
      epCtx.fillStyle = isCond ? "#f59e0b" : "#888";
      var mText = n.methodName + (isCond ? "?()" : "()");
      var maxMW = n.w - 16;
      while (epCtx.measureText(mText).width > maxMW && mText.length > 3) {
        mText = mText.slice(0, -1);
      }
      epCtx.fillText(mText, x + 8, methodY);
    }
  }

  epCtx.restore();
}

function epResize() {
  if (!epCanvas) return;
  var container = epCanvas.parentElement;
  if (!container) return;
  epW = container.clientWidth;
  epH = container.clientHeight;
  epCanvas.width = epW * epDpr;
  epCanvas.height = epH * epDpr;
  epCanvas.style.width = epW + "px";
  epCanvas.style.height = epH + "px";
  epCtx.setTransform(epDpr, 0, 0, epDpr, 0, 0);
  if (epNodes.length > 0) {
    epCenterCamera();
  }
  epScheduleRedraw();
}

function epShowTooltip(node, screenX, screenY) {
  if (!epTooltipEl) return;
  var color = EP_TYPE_COLORS[node.type] || EP_TYPE_COLORS.unknown;
  var methodHtml = "";
  if (node.methodName) {
    var mColor = node.conditional ? "#f59e0b" : "#ccc";
    methodHtml = '<div style="font-family:monospace;font-size:11px;color:' + mColor + ';margin-top:4px">.' + escHtml(node.methodName) + '()</div>';
  }
  var condLabel = "";
  if (node.conditional) {
    condLabel = '<div style="font-size:9px;color:#f59e0b;margin-top:4px">Conditionally called</div>';
  }
  var repeatLabel = "";
  if (node.expandedElsewhere) {
    repeatLabel = '<div style="font-size:9px;color:#888;margin-top:4px">\u21B1 Calls drawn at another call site</div>';
  }
  epTooltipEl.innerHTML = '<div class="tt-name">' + escHtml(node.className) + '</div>' +
    '<div class="tt-table" style="color:' + color + '">' + escHtml(node.type) + '</div>' +
    methodHtml + condLabel + repeatLabel;
  epTooltipEl.style.display = "block";

  var mainRect = epCanvas.parentElement.getBoundingClientRect();
  var tx = screenX + 16;
  var ty = screenY - 10;
  epTooltipEl.style.left = tx + "px";
  epTooltipEl.style.top = ty + "px";

  requestAnimationFrame(function() {
    var ttRect = epTooltipEl.getBoundingClientRect();
    if (ttRect.right > mainRect.right - 8) {
      epTooltipEl.style.left = (screenX - ttRect.width - 8) + "px";
    }
    if (ttRect.bottom > mainRect.bottom - 8) {
      epTooltipEl.style.top = (screenY - ttRect.height - 8) + "px";
    }
  });
}

function epHideTooltip() {
  if (epTooltipEl) epTooltipEl.style.display = "none";
}

function epShowCodePanel(node) {
  var panel = document.getElementById("ep-code-panel");
  if (!panel) return;
  window.__ndTrack?.("endpoint_code_opened");
  document.getElementById("ep-code-panel-class").textContent = node.className;
  var methodText = node.methodName ? "." + node.methodName + "()" : "";
  document.getElementById("ep-code-panel-method").textContent = methodText;
  document.getElementById("ep-code-panel-path").textContent = node.filePath || "";
  var bodyEl = document.getElementById("ep-code-panel-body");
  bodyEl.innerHTML = "";
  var code = node.filePath ? fileSources[node.filePath] : null;
  if (!code) {
    bodyEl.innerHTML = '<div class="ep-code-no-source">Source code not available</div>';
  } else if (window.createCodeViewer) {
    var highlightLines = node.line > 0 ? [node.line] : [];
    window.createCodeViewer(bodyEl, code, { highlightLines: highlightLines, firstLineNumber: 1 });
  } else {
    bodyEl.innerHTML = '<div class="ep-code-no-source">Code viewer not available</div>';
  }
  panel.classList.add("open");
}

function epHideCodePanel() {
  var panel = document.getElementById("ep-code-panel");
  if (panel) panel.classList.remove("open");
}

function renderEndpoints() {
  var sidebarEl = document.getElementById("endpoints-list");
  epCanvas = document.getElementById("endpoints-canvas");
  epTooltipEl = document.getElementById("endpoints-tooltip");
  if (!sidebarEl || !epCanvas || endpoints.endpoints.length === 0) return;

  epCtx = epCanvas.getContext("2d");
  epDpr = window.devicePixelRatio || 1;

  // Group endpoints by controller
  var controllers = {};
  var controllerOrder = [];
  for (var i = 0; i < endpoints.endpoints.length; i++) {
    var ep = endpoints.endpoints[i];
    if (!controllers[ep.controllerClass]) {
      controllers[ep.controllerClass] = [];
      controllerOrder.push(ep.controllerClass);
    }
    controllers[ep.controllerClass].push(ep);
  }

  // Set count
  document.getElementById("endpoints-count").textContent = endpoints.endpoints.length;

  // HTTP method badge colors
  var METHOD_COLORS = {
    GET: "ep-method-get",
    POST: "ep-method-post",
    PUT: "ep-method-put",
    PATCH: "ep-method-patch",
    DELETE: "ep-method-delete"
  };

  // Build sidebar
  var html = "";
  for (var c = 0; c < controllerOrder.length; c++) {
    var ctrlName = controllerOrder[c];
    var ctrlEndpoints = controllers[ctrlName];
    var ctrlId = "ep-ctrl-" + c;
    html += '<div class="st-row" data-toggle="' + ctrlId + '">';
    html += '<span class="st-toggle" data-toggle="' + ctrlId + '">\\u25BE</span>';
    html += '<span class="st-icon"><svg viewBox="0 0 16 16" fill="none" stroke="var(--nest-red)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="10" x2="9" y2="10"/></svg></span>';
    html += '<span class="st-label"><span class="st-entity-name">' + escHtml(ctrlName) + '</span></span>';
    html += '<span class="st-count">' + ctrlEndpoints.length + '</span>';
    html += '</div>';
    html += '<div class="st-children st-open" id="st-' + ctrlId + '">';

    for (var e = 0; e < ctrlEndpoints.length; e++) {
      var ep = ctrlEndpoints[e];
      var method = (ep.httpMethod || "GET").toUpperCase();
      var badgeClass = METHOD_COLORS[method] || "ep-method-get";
      html += '<div class="st-row ep-endpoint-row" data-ep-ctrl="' + escHtml(ctrlName) + '" data-ep-handler="' + escHtml(ep.handlerMethod) + '">';
      html += '<span class="st-indent"></span><span class="st-indent"></span>';
      html += '<span class="ep-method-badge ' + badgeClass + '">' + escHtml(method) + '</span>';
      html += '<span class="st-label">' + escHtml(ep.routePath || "/") + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }
  sidebarEl.innerHTML = html;

  // Sidebar click handlers
  sidebarEl.addEventListener("click", function(e) {
    // Toggle handling
    var toggleEl = e.target.closest(".st-toggle");
    if (toggleEl) {
      var toggleId = toggleEl.dataset.toggle;
      var childDiv = document.getElementById("st-" + toggleId);
      if (childDiv) {
        var isOpen = childDiv.classList.toggle("st-open");
        toggleEl.textContent = isOpen ? "\\u25BE" : "\\u25B8";
      }
      // If not an endpoint row, stop
      var row = e.target.closest(".ep-endpoint-row");
      if (!row) return;
    }

    // Endpoint selection
    var epRow = e.target.closest(".ep-endpoint-row");
    if (!epRow) return;
    var ctrlName = epRow.dataset.epCtrl;
    var handlerName = epRow.dataset.epHandler;

    // Find matching endpoint
    var found = null;
    for (var i = 0; i < endpoints.endpoints.length; i++) {
      var ep = endpoints.endpoints[i];
      if (ep.controllerClass === ctrlName && ep.handlerMethod === handlerName) {
        found = ep;
        break;
      }
    }
    if (!found) return;

    // Highlight selected
    var allRows = sidebarEl.querySelectorAll(".ep-endpoint-row");
    for (var i = 0; i < allRows.length; i++) {
      allRows[i].classList.toggle("st-selected", allRows[i] === epRow);
    }

    epSelectedEndpoint = found;

    // Build graph and render
    var emptyState = document.getElementById("endpoints-empty-state");
    if (emptyState) emptyState.style.display = "none";
    epCanvas.style.display = "block";

    epBuildGraph(found);
    epLayout();
    epResize();
  });

  // Canvas interactions
  epCanvas.addEventListener("mousedown", function(e) {
    var rect = epCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = epScreenToWorld(sx, sy);
    var hit = epHitTest(pos.x, pos.y);
    epDragMoved = false;
    if (hit) {
      epDragging = hit;
      epHideTooltip();
    } else {
      epPanning = true;
      epPanStart = { x: e.clientX, y: e.clientY };
    }
  });

  epCanvas.addEventListener("mousemove", function(e) {
    var rect = epCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = epScreenToWorld(sx, sy);

    if (epDragging) {
      epDragMoved = true;
      epDragging.x = pos.x;
      epDragging.y = pos.y;
      epScheduleRedraw();
      epHideTooltip();
    } else if (epPanning) {
      epDragMoved = true;
      epCamX += (e.clientX - epPanStart.x) / epZoom;
      epCamY += (e.clientY - epPanStart.y) / epZoom;
      epPanStart = { x: e.clientX, y: e.clientY };
      epScheduleRedraw();
      epHideTooltip();
    } else {
      var hit = epHitTest(pos.x, pos.y);
      if (hit !== epHoveredNode) {
        epHoveredNode = hit;
        epScheduleRedraw();
        if (hit) {
          epShowTooltip(hit, sx, sy);
        } else {
          epHideTooltip();
        }
      } else if (hit) {
        epShowTooltip(hit, sx, sy);
      }
    }
  });

  epCanvas.addEventListener("mouseup", function() {
    var clickedNode = epDragging;
    if (!epDragMoved && clickedNode) {
      epShowCodePanel(clickedNode);
    }
    epDragging = null;
    epPanning = false;
  });

  epCanvas.addEventListener("mouseleave", function() {
    epDragging = null;
    epPanning = false;
    epHoveredNode = null;
    epHideTooltip();
    epScheduleRedraw();
  });

  epCanvas.addEventListener("wheel", function(e) {
    e.preventDefault();
    // ctrlKey or metaKey means a pinch, which zooms; anything else pans.
    if (!(e.ctrlKey || e.metaKey)) {
      epCamX -= e.deltaX / epZoom;
      epCamY -= e.deltaY / epZoom;
      epHideTooltip();
      epScheduleRedraw();
      return;
    }
    var zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    var newZoom = epZoom * zoomFactor;
    newZoom = Math.max(0.2, Math.min(3, newZoom));

    var rect = epCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var wx = (mx - epW / 2) / epZoom + epW / 2 - epCamX;
    var wy = (my - epH / 2) / epZoom + epH / 2 - epCamY;

    epZoom = newZoom;
    epCamX = epW / 2 - wx + (mx - epW / 2) / epZoom;
    epCamY = epH / 2 - wy + (my - epH / 2) / epZoom;

    epHideTooltip();
    epScheduleRedraw();
  }, { passive: false });

  // Recenter button
  var recenterBtn = document.getElementById("endpoints-recenter");
  if (recenterBtn) {
    recenterBtn.addEventListener("click", function() {
      epCenterCamera();
      epScheduleRedraw();
    });
  }

  // Code panel close button
  var closePanelBtn = document.getElementById("ep-code-panel-close");
  if (closePanelBtn) {
    closePanelBtn.addEventListener("click", function() {
      epHideCodePanel();
    });
  }

  // Resize handle for code panel
  var epCodePanel = document.getElementById("ep-code-panel");
  var resizeHandle = document.getElementById("ep-code-panel-resize");
  if (resizeHandle && epCodePanel) {
    var epResizing = false;
    var epStartX, epStartW;
    resizeHandle.addEventListener("mousedown", function(e) {
      epResizing = true;
      epStartX = e.clientX;
      epStartW = epCodePanel.offsetWidth;
      resizeHandle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!epResizing) return;
      var w = epStartW + (e.clientX - epStartX);
      if (w < 300) w = 300;
      if (w > window.innerWidth * 0.8) w = window.innerWidth * 0.8;
      epCodePanel.style.width = w + "px";
    });
    document.addEventListener("mouseup", function() {
      if (!epResizing) return;
      epResizing = false;
      resizeHandle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  }

  // Escape key to close code panel
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && activeTab === "endpoints") {
      epHideCodePanel();
    }
  });

  // Resize handling
  epResize();
  window.addEventListener("resize", function() {
    if (activeTab === "endpoints") epResize();
  });

  // Show empty state initially
  var emptyState = document.getElementById("endpoints-empty-state");
  if (emptyState) emptyState.style.display = "flex";
  epCanvas.style.display = "none";
}
`;
