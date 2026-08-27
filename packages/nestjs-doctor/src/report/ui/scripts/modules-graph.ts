import { REPORT_FONT_STACK } from "../styles.js";

export const MODULES_GRAPH = `
// ── Modules graph: derived indexes ──
const mgUnusedProviders = {};
for (let di = 0; di < diagnostics.length; di++) {
  if (diagnostics[di].rule === "performance/no-unused-providers") {
    const um = (diagnostics[di].message || "").match(/Provider '([^']+)'/);
    if (um) mgUnusedProviders[um[1]] = true;
  }
}
const circularEdges = new Set();
const circularModules = new Set();
for (const cycle of graph.circularDeps) {
  for (let i = 0; i < cycle.length; i++) {
    circularModules.add(cycle[i]);
    const next = cycle[(i + 1) % cycle.length];
    circularEdges.add(cycle[i] + "->" + next);
  }
}

const importedBy = new Set();
for (const e of graph.edges) importedBy.add(e.to);
const rootModules = new Set();
for (const m of graph.modules) {
  if (!importedBy.has(m.name)) rootModules.add(m.name);
}
for (const m of graph.modules) {
  if (m.name === "AppModule") rootModules.add(m.name);
}
for (const r of graph.bootstrapRoots) rootModules.add(r);

// ── Modules graph: state ──
var MG_INTRA_EDGE = "#444";
var MG_CROSS_EDGE = "#22d3ee";
var MG_CYCLE = "#ea2845";
var MG_GLOBAL = "#fbbf24";
var MG_NODE_H = 40;
var RPT_FONT = '${REPORT_FONT_STACK}';

var mgCanvas = null, mgCtx = null, mgDpr = window.devicePixelRatio || 1;
var mgW = 0, mgH = 0;
var mgCamX = 0, mgCamY = 0, mgZoom = 1, mgMinZoom = 0.2;
var mgNodes = [], mgNodeMap = {}, mgClusters = [], mgEdges = [];
var MG_EXTERNAL_PROJECT = "(external)";
var mgHideExternal = true;
var mgImporters = {};
var mgGlobalNames = [];
var mgPanning = false, mgPanStart = { x: 0, y: 0 }, mgPanMoved = false;
var mgSelected = null, mgHovered = null;
var mgShowGlobals = false;
var mgMatches = null;
var mgFocusSet = null;

var mgDirty = false;
function mgScheduleRedraw() {
  if (!mgDirty) {
    mgDirty = true;
    requestAnimationFrame(function() { mgDirty = false; mgDraw(); });
  }
}

// ── Modules graph: layout ──
/** Groups modules by owning project, keeping first-seen order. */
function mgBuildClusters(modules) {
  var order = [], byKey = {};
  for (var i = 0; i < modules.length; i++) {
    var key = modules[i].project || "";
    if (!byKey[key]) {
      byKey[key] = { key: key, nodes: [], x: 0, y: 0, w: 0, h: 0, innerX: 0, innerY: 0 };
      order.push(byKey[key]);
    }
    byKey[key].nodes.push(modules[i]);
  }
  return order;
}

/** Packs nodes into a compact grid, used when dagre is absent. */
function mgGridLayout(nodes, gutter) {
  var cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  var cellW = 0, cellH = 0, i;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].w > cellW) cellW = nodes[i].w;
    if (nodes[i].h > cellH) cellH = nodes[i].h;
  }
  var rows = Math.ceil(nodes.length / cols);
  for (i = 0; i < nodes.length; i++) {
    nodes[i].x = (i % cols) * (cellW + gutter) + cellW / 2;
    nodes[i].y = Math.floor(i / cols) * (cellH + gutter) + cellH / 2;
  }
  return {
    w: cols * cellW + (cols - 1) * gutter,
    h: rows * cellH + (rows - 1) * gutter
  };
}

/** Ranks one cluster from its own origin, with dagre or a grid fallback. */
function mgLayoutCluster(nodes, edges) {
  var i;
  if (nodes.length === 1 || typeof dagre === "undefined") {
    return mgGridLayout(nodes, 30);
  }

  var present = {};
  for (i = 0; i < nodes.length; i++) present[nodes[i].name] = true;

  var g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 26, ranksep: 58, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(function() { return {}; });
  for (i = 0; i < nodes.length; i++) {
    g.setNode(nodes[i].name, { width: nodes[i].w, height: nodes[i].h });
  }

  var seen = {};
  for (i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (e.from === e.to) continue;
    if (!present[e.from] || !present[e.to]) continue;
    var key = e.from + "->" + e.to;
    if (seen[key]) continue;
    seen[key] = true;
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (i = 0; i < nodes.length; i++) {
    var laid = g.node(nodes[i].name);
    if (!laid) continue;
    nodes[i].x = laid.x;
    nodes[i].y = laid.y;
    minX = Math.min(minX, laid.x - nodes[i].w / 2);
    maxX = Math.max(maxX, laid.x + nodes[i].w / 2);
    minY = Math.min(minY, laid.y - nodes[i].h / 2);
    maxY = Math.max(maxY, laid.y + nodes[i].h / 2);
  }
  if (minX === Infinity) return mgGridLayout(nodes, 30);
  for (i = 0; i < nodes.length; i++) {
    nodes[i].x -= minX;
    nodes[i].y -= minY;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Shelf-packs cluster boxes into a roughly square area. */
function mgPackBoxes(boxes, targetW, gutter) {
  var x = 0, y = 0, shelfH = 0;
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    if (x > 0 && x + box.w > targetW) {
      x = 0;
      y += shelfH + gutter;
      shelfH = 0;
    }
    box.x = x;
    box.y = y;
    x += box.w + gutter;
    if (box.h > shelfH) shelfH = box.h;
  }
}

/**
 * Lays every module out inside its project container, then packs the
 * containers. Nodes must already carry w and h.
 */
function mgComputeLayout(modules, edges) {
  var GUTTER = 64, PAD = 20, HEADER = 26;
  var clusters = mgBuildClusters(modules);
  var i, j;

  for (i = 0; i < clusters.length; i++) {
    var c = clusters[i];
    var header = c.key ? HEADER : 0;
    var size = mgLayoutCluster(c.nodes, edges);
    c.innerX = PAD;
    c.innerY = PAD + header;
    c.header = header;
    c.w = size.w + PAD * 2;
    c.h = size.h + PAD * 2 + header;
  }

  clusters.sort(function(a, b) { return b.h - a.h || b.w - a.w; });

  var area = 0;
  for (i = 0; i < clusters.length; i++) area += clusters[i].w * clusters[i].h;
  var targetW = Math.max(1000, Math.sqrt(area) * 1.7);
  mgPackBoxes(clusters, targetW, GUTTER);

  for (i = 0; i < clusters.length; i++) {
    var box = clusters[i];
    for (j = 0; j < box.nodes.length; j++) {
      box.nodes[j].x += box.x + box.innerX;
      box.nodes[j].y += box.y + box.innerY;
    }
  }
  return clusters;
}

/** Maps each module to the modules that import it. */
function mgReverseIndex(edges) {
  var idx = {};
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (!idx[e.to]) idx[e.to] = [];
    if (idx[e.to].indexOf(e.from) < 0) idx[e.to].push(e.from);
  }
  return idx;
}

/** Every module that transitively imports this one, counted per project. */
function mgBlastRadius(name, reverseIndex, projectOf) {
  var seen = {};
  seen[name] = true;
  var queue = [name], names = [], byProject = {}, projectCount = 0;
  while (queue.length > 0) {
    var cur = queue.shift();
    var incoming = reverseIndex[cur] || [];
    for (var i = 0; i < incoming.length; i++) {
      var src = incoming[i];
      if (seen[src]) continue;
      seen[src] = true;
      names.push(src);
      queue.push(src);
      var p = projectOf(src) || "";
      if (byProject[p] === undefined) { byProject[p] = 0; projectCount++; }
      byProject[p]++;
    }
  }
  names.sort();
  return { names: names, byProject: byProject, projectCount: projectCount };
}

// ── Modules graph: joins into the other payloads ──
function mgProvidersOf(moduleName) {
  var out = [];
  for (var i = 0; i < providers.length; i++) {
    if (providers[i].module === moduleName) out.push(providers[i]);
  }
  return out;
}

var MG_WIRING_TYPES = {
  service: 1, repository: 1, guard: 1, interceptor: 1,
  pipe: 1, filter: 1, gateway: 1
};

/**
 * Collapses statement nodes so only injected collaborators are left, and
 * drops a class method already listed at this level.
 */
function mgWiringChildren(deps) {
  var seen = {}, out = [], i, j;
  var list = deps || [];
  for (i = 0; i < list.length; i++) {
    var d = list[i];
    if (MG_WIRING_TYPES[d.type]) {
      var key = d.className + "." + d.methodName;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(d);
      continue;
    }
    var inner = mgWiringChildren(d.dependencies);
    for (j = 0; j < inner.length; j++) {
      var k = inner[j].className + "." + inner[j].methodName;
      if (seen[k]) continue;
      seen[k] = true;
      out.push(inner[j]);
    }
  }
  return out;
}

function mgEndpointsOf(controllerClass) {
  var list = (endpoints && endpoints.endpoints) || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].controllerClass === controllerClass) out.push(list[i]);
  }
  return out;
}

// ── Modules graph: build ──
function mgFormatMs(ms) {
  var r = Math.round(ms * 10) / 10;
  if (r < 1) return "<1ms";
  if (r < 10) return r.toFixed(1) + "ms";
  return Math.round(ms) + "ms";
}

function mgMeasureNode(n) {
  var label = getDisplayName(n);
  var sub = n.providers.length + "p \\u00b7 " + n.controllers.length + "c";
  if (n.initTimings && n.initTimings.length > 0) {
    sub += " \\u00b7 " + mgFormatMs(n.initTimings[0].initTime);
  }
  mgCtx.font = "bold 12px " + RPT_FONT;
  var lw = mgCtx.measureText(label).width;
  mgCtx.font = "10px " + RPT_FONT;
  var sw = mgCtx.measureText(sub).width;
  n.label = label;
  n.sub = sub;
  n.w = Math.max(112, Math.max(lw, sw) + 28);
  n.h = MG_NODE_H;
}

function mgBuild() {
  var i;
  mgNodes = [];
  mgNodeMap = {};
  for (i = 0; i < graph.modules.length; i++) {
    var m = graph.modules[i];
    var n = {
      name: m.name,
      project: m.project || "",
      filePath: m.filePath,
      line: m.line,
      isGlobal: !!m.isGlobal,
      imports: m.imports || [],
      exports: m.exports || [],
      providers: m.providers || [],
      providerTokens: m.providerTokens || [],
      controllers: m.controllers || [],
      dynamicImports: m.dynamicImports || null,
      initTimings: m.initTimings || null,
      hookTimings: m.hookTimings || null,
      x: 0, y: 0, w: 0, h: MG_NODE_H
    };
    mgMeasureNode(n);
    mgNodes.push(n);
    mgNodeMap[n.name] = n;
    if (n.isGlobal) mgGlobalNames.push(n.name);
  }

  // Synthetic nodes for package-provided modules (ConfigModule, BullModule...).
  var declaredCount = mgNodes.length;
  var extEdges = [];
  for (i = 0; i < declaredCount; i++) {
    var srcNode = mgNodes[i];
    for (var k = 0; k < srcNode.imports.length; k++) {
      var targetName = srcNode.imports[k];
      if (!mgNodeMap[targetName]) {
        var xn = {
          name: targetName,
          project: MG_EXTERNAL_PROJECT,
          filePath: "",
          line: 0,
          isGlobal: false,
          external: true,
          imports: [], exports: [], providers: [], providerTokens: [], controllers: [],
          dynamicImports: null,
          initTimings: null,
          x: 0, y: 0, w: 0, h: MG_NODE_H
        };
        mgMeasureNode(xn);
        xn.sub = "package";
        mgNodes.push(xn);
        mgNodeMap[targetName] = xn;
      }
      if (mgNodeMap[targetName].external) {
        extEdges.push({ from: srcNode.name, to: targetName });
      }
    }
  }
  projectColorMap[MG_EXTERNAL_PROJECT] = "#6b7280";
  var allEdges = graph.edges.concat(extEdges);

  mgEdges = [];
  for (i = 0; i < allEdges.length; i++) {
    var e = allEdges[i];
    var a = mgNodeMap[e.from], b = mgNodeMap[e.to];
    if (!a || !b) continue;
    mgEdges.push({
      from: e.from,
      to: e.to,
      ext: !!(a.external || b.external),
      cross: !a.external && !b.external && a.project !== b.project,
      cycle: circularEdges.has(e.from + "->" + e.to),
      label: (a.dynamicImports && a.dynamicImports[e.to]) || null
    });
  }

  mgImporters = mgReverseIndex(allEdges);
  mgClusters = mgComputeLayout(mgNodes, allEdges);
}

// ── Modules graph: camera ──
function mgResize() {
  if (!mgCanvas) return;
  var wrap = document.getElementById("mg-wrap");
  var w = wrap.clientWidth;
  var h = wrap.clientHeight;
  if (w === 0 || h === 0) return;
  // Resetting canvas.width clears the bitmap; skip when geometry is unchanged.
  if (w === mgW && h === mgH) { mgScheduleRedraw(); return; }
  mgW = w;
  mgH = h;
  mgCanvas.width = mgW * mgDpr;
  mgCanvas.height = mgH * mgDpr;
  mgCanvas.style.width = mgW + "px";
  mgCanvas.style.height = mgH + "px";
  mgCtx.setTransform(mgDpr, 0, 0, mgDpr, 0, 0);
  mgScheduleRedraw();
}

function mgBounds(nodes) {
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

function mgCenterCamera() {
  if (mgNodes.length === 0 || mgW === 0) return;
  var visible = mgNodes.filter(function(n) { return !(mgHideExternal && n.external); });
  var b = mgBounds(visible.length ? visible : mgNodes);
  var gw = b.maxX - b.minX, gh = b.maxY - b.minY;
  var fit = Math.min(1.4, Math.min((mgW * 0.9) / (gw || 1), (mgH * 0.9) / (gh || 1)));
  mgMinZoom = Math.min(0.2, fit);
  mgZoom = Math.max(mgMinZoom, fit);
  mgCamX = mgW / 2 - (b.minX + b.maxX) / 2;
  mgCamY = mgH / 2 - (b.minY + b.maxY) / 2;
}

function mgScreenToWorld(sx, sy) {
  return {
    x: (sx - mgW / 2) / mgZoom + mgW / 2 - mgCamX,
    y: (sy - mgH / 2) / mgZoom + mgH / 2 - mgCamY
  };
}

function mgPanTo(n) {
  mgCamX = mgW / 2 - n.x;
  mgCamY = mgH / 2 - n.y;
  mgScheduleRedraw();
}

// ── Camera flights: smooth pan/zoom to a node or a set of nodes ──
var mgFlightToken = 0;

function mgFlyTo(targetCamX, targetCamY, targetZoom) {
  var token = ++mgFlightToken;
  // Hidden documents get no animation frames; jump instead of stalling.
  if (document.visibilityState === "hidden") {
    mgCamX = targetCamX;
    mgCamY = targetCamY;
    mgZoom = targetZoom;
    mgDraw();
    return;
  }
  var fromX = mgCamX, fromY = mgCamY, fromZ = mgZoom;
  var start = null;
  var DURATION = 280;
  function step(ts) {
    if (token !== mgFlightToken) return;
    if (start === null) start = ts;
    var t = Math.min(1, (ts - start) / DURATION);
    var e = t * (2 - t);
    mgCamX = fromX + (targetCamX - fromX) * e;
    mgCamY = fromY + (targetCamY - fromY) * e;
    mgZoom = fromZ + (targetZoom - fromZ) * e;
    mgDraw();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Center one node at a readable zoom, the way picking a schema table does. */
function mgFlyToNode(n) {
  var zoom = Math.min(1.2, Math.max(mgZoom, 0.85));
  mgFlyTo(mgW / 2 - n.x, mgH / 2 - n.y, zoom);
}

/** Fit a set of module names in view, with padding. */
function mgFitNodes(names) {
  var nodes = [];
  for (var i = 0; i < names.length; i++) {
    var node = mgNodeMap[names[i]];
    if (node) nodes.push(node);
  }
  if (nodes.length === 0) return;
  var b = mgBounds(nodes);
  var gw = b.maxX - b.minX + 160, gh = b.maxY - b.minY + 160;
  var zoom = Math.min(1.2, Math.min(mgW / gw, mgH / gh));
  mgFlyTo(
    mgW / 2 - (b.minX + b.maxX) / 2,
    mgH / 2 - (b.minY + b.maxY) / 2,
    Math.max(mgMinZoom, zoom)
  );
}

var mgLastZoomUi = null;
function mgSyncZoomUi() {
  var pct = Math.round(mgZoom * 100);
  if (pct === mgLastZoomUi) return;
  mgLastZoomUi = pct;
  var range = document.getElementById("mg-zoom-range");
  var label = document.getElementById("mg-zoom-value");
  if (range) range.value = String(Math.max(5, Math.min(500, pct)));
  if (label) {
    label.textContent = pct + "%";
    label.setAttribute("aria-label", pct + "% \\u00b7 fit to view");
  }
}

// ── Modules graph: visibility ──
function mgNodeAlpha(n) {
  if (mgHideExternal && n.external) return 0;
  var a = 1;
  if (activeProject !== "all" && n.project !== activeProject) a = 0.16;
  if (mgMatches && !mgMatches[n.name]) a = Math.min(a, 0.1);
  if (mgFocusSet && !mgFocusSet[n.name]) a = Math.min(a, 0.13);
  return a;
}

function mgEdgeAlpha(e) {
  var a = mgNodeMap[e.from], b = mgNodeMap[e.to];
  if (!a || !b) return 0;
  if (mgHideExternal && e.ext) return 0;
  if (mgFocusSet) {
    return e.from === mgSelected.name || e.to === mgSelected.name ? 1 : 0.05;
  }
  var aa = mgNodeAlpha(a), ba = mgNodeAlpha(b);
  // A cross-project edge that still touches something visible stays readable.
  var base = aa === ba ? aa : (Math.max(aa, ba) === 1 ? 0.55 : Math.min(aa, ba));
  // Cross-project edges render dimmer.
  return e.cross ? base * 0.42 : base;
}

function mgClusterAlpha(c) {
  if (activeProject !== "all" && c.key !== activeProject) return 0.28;
  return 1;
}

// ── Modules graph: drawing ──
function mgRect(x, y, w, h) {
  mgCtx.beginPath();
  mgCtx.rect(x, y, w, h);
}

/** Where the line from a node's centre towards a point leaves its box. */
function mgBoxPort(n, tx, ty) {
  var dx = tx - n.x, dy = ty - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  var sx = dx === 0 ? Infinity : (n.w / 2) / Math.abs(dx);
  var sy = dy === 0 ? Infinity : (n.h / 2) / Math.abs(dy);
  var s = Math.min(sx, sy);
  return { x: n.x + dx * s, y: n.y + dy * s };
}

function mgDrawArrow(fromX, fromY, toX, toY, color, dash, width) {
  var angle = Math.atan2(toY - fromY, toX - fromX);
  mgCtx.beginPath();
  mgCtx.setLineDash(dash || []);
  mgCtx.moveTo(fromX, fromY);
  mgCtx.lineTo(toX, toY);
  mgCtx.strokeStyle = color;
  mgCtx.lineWidth = width || 1.4;
  mgCtx.stroke();
  mgCtx.setLineDash([]);
  var head = 8;
  mgCtx.beginPath();
  mgCtx.moveTo(toX, toY);
  mgCtx.lineTo(toX - head * Math.cos(angle - 0.4), toY - head * Math.sin(angle - 0.4));
  mgCtx.lineTo(toX - head * Math.cos(angle + 0.4), toY - head * Math.sin(angle + 0.4));
  mgCtx.closePath();
  mgCtx.fillStyle = color;
  mgCtx.fill();
}

function mgDrawClusters() {
  for (var i = 0; i < mgClusters.length; i++) {
    var c = mgClusters[i];
    if (mgHideExternal && c.key === MG_EXTERNAL_PROJECT) continue;
    var color = c.key ? (projectColorMap[c.key] || "#555") : "#555";
    mgCtx.globalAlpha = mgClusterAlpha(c) * 0.5;
    mgRect(c.x, c.y, c.w, c.h);
    mgCtx.fillStyle = "rgba(255,255,255,0.022)";
    mgCtx.fill();
    mgCtx.strokeStyle = color;
    mgCtx.lineWidth = 1;
    mgCtx.setLineDash([]);
    mgCtx.stroke();
    if (c.key) {
      mgCtx.globalAlpha = mgClusterAlpha(c);
      mgCtx.fillStyle = color;
      mgCtx.font = "bold 12px " + RPT_FONT;
      mgCtx.textAlign = "left";
      mgCtx.textBaseline = "middle";
      mgCtx.fillText(c.key, c.x + 12, c.y + 15);
      mgCtx.fillStyle = "#666";
      mgCtx.font = "10px " + RPT_FONT;
      mgCtx.fillText(c.nodes.length + (c.nodes.length === 1 ? " module" : " modules"),
        c.x + 16 + mgCtx.measureText(c.key).width * 1.15, c.y + 15);
    }
  }
  mgCtx.globalAlpha = 1;
}

function mgDrawGlobalReach() {
  if (!mgShowGlobals || mgGlobalNames.length === 0) return;
  for (var g = 0; g < mgGlobalNames.length; g++) {
    var src = mgNodeMap[mgGlobalNames[g]];
    if (!src) continue;
    // Halo around each @Global() source.
    mgCtx.globalAlpha = 0.9;
    mgCtx.beginPath();
    mgCtx.rect(src.x - src.w / 2 - 5, src.y - src.h / 2 - 5, src.w + 10, src.h + 10);
    mgCtx.strokeStyle = MG_GLOBAL;
    mgCtx.lineWidth = 2;
    mgCtx.stroke();
    mgCtx.globalAlpha = 0.45;
    for (var i = 0; i < mgNodes.length; i++) {
      var dst = mgNodes[i];
      if (dst === src) continue;
      if (dst.imports.indexOf(src.name) >= 0) continue;
      var a = mgBoxPort(src, dst.x, dst.y);
      var b = mgBoxPort(dst, src.x, src.y);
      mgCtx.beginPath();
      mgCtx.setLineDash([2, 4]);
      mgCtx.moveTo(a.x, a.y);
      mgCtx.lineTo(b.x, b.y);
      mgCtx.strokeStyle = MG_GLOBAL;
      mgCtx.lineWidth = 1.5;
      mgCtx.stroke();
      mgCtx.setLineDash([]);
    }
  }
  mgCtx.globalAlpha = 1;
}

function mgDrawEdges() {
  var labels = [];
  for (var i = 0; i < mgEdges.length; i++) {
    var e = mgEdges[i];
    var alpha = mgEdgeAlpha(e);
    if (alpha <= 0) continue;
    var a = mgNodeMap[e.from], b = mgNodeMap[e.to];
    var p1 = mgBoxPort(a, b.x, b.y);
    var p2 = mgBoxPort(b, a.x, a.y);
    var color = e.cycle ? MG_CYCLE : (e.cross ? MG_CROSS_EDGE : MG_INTRA_EDGE);
    var dash = e.cycle ? [5, 4] : (e.cross ? [7, 5] : []);
    if (e.ext && !e.cycle) { color = "#6b7280"; dash = [3, 4]; }
    var lineWidth = e.cross || e.cycle ? 1.6 : 1.3;
    // Selection edges split by direction: imports vs used-by.
    // Dashes move along the value flow, from imported to importer.
    var isSelEdge = false;
    if (mgSelected && !e.cycle) {
      if (e.from === mgSelected.name) { color = MG_SEL_OUT; isSelEdge = true; }
      else if (e.to === mgSelected.name) { color = MG_SEL_IN; isSelEdge = true; }
    }
    // A focused cycle takes over: its edges burn bright, the rest recede.
    if (mgCycleFocus) {
      if (e.cycle && mgCycleFocus[e.from] && mgCycleFocus[e.to]) {
        alpha = 1;
        lineWidth = 3;
        mgCtx.lineDashOffset = mgDashT;
        mgCtx.globalAlpha = alpha;
        mgDrawArrow(p1.x, p1.y, p2.x, p2.y, MG_CYCLE, [6, 5], lineWidth);
        mgCtx.lineDashOffset = 0;
        continue;
      }
      alpha *= 0.15;
    }
    if (isSelEdge) {
      lineWidth = 2.2;
      dash = [9, 6];
      alpha = Math.max(alpha, 0.95);
    }
    mgCtx.globalAlpha = alpha;
    if (isSelEdge) {
      // Arrowheads on selection edges follow the value flow.
      mgCtx.lineDashOffset = -mgDashT;
      mgDrawArrow(p2.x, p2.y, p1.x, p1.y, color, dash, lineWidth);
      mgCtx.lineDashOffset = 0;
    } else {
      mgDrawArrow(p1.x, p1.y, p2.x, p2.y, color, dash, lineWidth);
    }
    if (e.label && alpha > 0.5) {
      labels.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, text: e.label, alpha: alpha });
    }
  }
  mgCtx.globalAlpha = 1;

  mgCtx.font = "9px " + RPT_FONT;
  mgCtx.textAlign = "center";
  mgCtx.textBaseline = "middle";
  for (var j = 0; j < labels.length; j++) {
    var l = labels[j];
    var w = mgCtx.measureText(l.text).width + 8;
    mgCtx.globalAlpha = l.alpha;
    mgRect(l.x - w / 2, l.y - 7, w, 14);
    mgCtx.fillStyle = "#0f0f0f";
    mgCtx.fill();
    mgCtx.strokeStyle = "rgba(255,255,255,0.14)";
    mgCtx.lineWidth = 1;
    mgCtx.stroke();
    mgCtx.fillStyle = "#9ca3af";
    mgCtx.fillText(l.text, l.x, l.y);
  }
  mgCtx.globalAlpha = 1;

  // White animated highlight for the hovered detail-panel row.
  var hoverPair = null;
  if (mgSelected && mgHoverImport && mgNodeMap[mgHoverImport]) {
    hoverPair = [mgSelected, mgNodeMap[mgHoverImport]];
  } else if (mgSelected && mgHoverUsedBy && mgNodeMap[mgHoverUsedBy]) {
    hoverPair = [mgNodeMap[mgHoverUsedBy], mgSelected];
  }
  if (hoverPair) {
    var hp1 = mgBoxPort(hoverPair[0], hoverPair[1].x, hoverPair[1].y);
    var hp2 = mgBoxPort(hoverPair[1], hoverPair[0].x, hoverPair[0].y);
    mgCtx.lineDashOffset = -mgDashT;
    mgDrawArrow(hp2.x, hp2.y, hp1.x, hp1.y, "#ffffff", [8, 6], 2.6);
    mgCtx.lineDashOffset = 0;
    mgCtx.globalAlpha = 1;
  }
}

var mgHoverImport = null;
var mgHoverUsedBy = null;
var mgCycleFocus = null;
var mgDashT = 0;
var mgHoverAnimOn = false;
var MG_SEL_OUT = "#60a5fa";
var MG_SEL_IN = "#34d399";

function mgHoverAnimTick() {
  if (mgHoverImport === null && mgHoverUsedBy === null && !mgSelected) {
    mgHoverAnimOn = false;
    return;
  }
  mgDashT = (mgDashT + 0.25) % 10000;
  mgDraw();
  requestAnimationFrame(mgHoverAnimTick);
}

function mgStartHoverAnim() {
  if (!mgHoverAnimOn) {
    mgHoverAnimOn = true;
    requestAnimationFrame(mgHoverAnimTick);
  }
}

function mgDrawNodes() {
  for (var i = 0; i < mgNodes.length; i++) {
    var n = mgNodes[i];
    var alpha = mgNodeAlpha(n);
    if (alpha <= 0) continue;
    var isRoot = rootModules.has(n.name);
    var isCirc = circularModules.has(n.name);
    var isSel = mgSelected === n;
    var x = n.x - n.w / 2, y = n.y - n.h / 2;

    mgCtx.globalAlpha = alpha;

    if (n.isGlobal) {
      mgRect(x - 4, y - 4, n.w + 8, n.h + 8);
      mgCtx.strokeStyle = "rgba(251,191,36,0.35)";
      mgCtx.lineWidth = 2;
      mgCtx.setLineDash([]);
      mgCtx.stroke();
    }

    var fill = "#1a1a2e", stroke = "#333";
    if (n.external) { fill = "#161616"; stroke = "#4b5563"; }
    if (isRoot) { fill = "#1a2e1a"; stroke = "#2a5a2a"; }
    if (n.isGlobal) { fill = "#2a2410"; stroke = MG_GLOBAL; }
    if (isCirc) { fill = "#2e1a1a"; stroke = MG_CYCLE; }
    if (isSel) { stroke = "#fff"; }

    mgRect(x, y, n.w, n.h);
    mgCtx.fillStyle = fill;
    mgCtx.fill();
    mgCtx.strokeStyle = stroke;
    mgCtx.lineWidth = isSel ? 2 : 1;
    mgCtx.setLineDash(n.external && !isSel ? [4, 3] : []);
    mgCtx.stroke();
    mgCtx.setLineDash([]);

    mgCtx.textAlign = "center";
    mgCtx.textBaseline = "middle";
    mgCtx.fillStyle = n.external ? "#9ca3af" : "#fff";
    mgCtx.font = "bold 12px " + RPT_FONT;
    mgCtx.fillText(n.label, n.x, n.y - 6);
    mgCtx.fillStyle = "#888";
    mgCtx.font = "10px " + RPT_FONT;
    mgCtx.fillText(n.sub, n.x, n.y + 9);
  }
  mgCtx.globalAlpha = 1;
}

function mgDraw() {
  if (!mgCtx || mgW === 0) return;
  mgSyncZoomUi();
  mgCtx.save();
  mgCtx.clearRect(0, 0, mgW, mgH);
  mgCtx.translate(mgW / 2, mgH / 2);
  mgCtx.scale(mgZoom, mgZoom);
  mgCtx.translate(-mgW / 2 + mgCamX, -mgH / 2 + mgCamY);
  mgDrawClusters();
  mgDrawGlobalReach();
  mgDrawEdges();
  mgDrawNodes();
  mgCtx.restore();
}

// ── Modules graph: interaction ──
function mgHitTest(wx, wy) {
  for (var i = mgNodes.length - 1; i >= 0; i--) {
    var n = mgNodes[i];
    if (mgHideExternal && n.external) continue;
    if (wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 &&
        wy >= n.y - n.h / 2 && wy <= n.y + n.h / 2) {
      return n;
    }
  }
  return null;
}

function mgShowTooltip(n, sx, sy) {
  var el = document.getElementById("mg-tooltip");
  if (!el) return;
  var bits = [];
  if (n.project) bits.push(n.project);
  bits.push(n.providers.length + "\\u00a0providers");
  bits.push(n.controllers.length + "\\u00a0controllers");
  bits.push(n.imports.length + "\\u00a0imports");
  if (n.initTimings && n.initTimings.length > 0) {
    bits.push(mgFormatMs(n.initTimings[0].initTime) + "\\u00a0slowest\\u00a0class");
  }
  el.innerHTML = '<div class="tt-name">' + mgEsc(getDisplayName(n)) + '</div>' +
    '<div class="tt-table">' + mgEsc(bits.join(" \\u00b7 ")) + '</div>';
  el.style.display = "block";
  el.style.left = Math.min(sx + 14, mgW - 240) + "px";
  el.style.top = (sy + 14) + "px";
}

function mgHideTooltip() {
  var el = document.getElementById("mg-tooltip");
  if (el) el.style.display = "none";
}

function mgApplySearch(raw) {
  var q = (raw || "").trim().toLowerCase();
  if (q === "") {
    mgMatches = null;
    mgScheduleRedraw();
    return;
  }
  mgMatches = {};
  var first = null;
  for (var i = 0; i < mgNodes.length; i++) {
    var n = mgNodes[i];
    if (mgHideExternal && n.external) continue;
    if (n.name.toLowerCase().indexOf(q) >= 0) {
      mgMatches[n.name] = true;
      if (!first) first = n;
    }
  }
  if (first) mgPanTo(first);
  mgScheduleRedraw();
}

function mgBindEvents() {
  mgCanvas.addEventListener("mousedown", function(e) {
    mgPanning = true;
    mgPanMoved = false;
    mgPanStart = { x: e.clientX, y: e.clientY };
  });

  mgCanvas.addEventListener("mousemove", function(e) {
    var rect = mgCanvas.getBoundingClientRect();
    if (mgPanning) {
      var dx = e.clientX - mgPanStart.x, dy = e.clientY - mgPanStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) mgPanMoved = true;
      mgCamX += dx / mgZoom;
      mgCamY += dy / mgZoom;
      mgPanStart = { x: e.clientX, y: e.clientY };
      mgHideTooltip();
      mgScheduleRedraw();
      return;
    }
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    var pos = mgScreenToWorld(sx, sy);
    var hit = mgHitTest(pos.x, pos.y);
    if (hit !== mgHovered) {
      mgHovered = hit;
      if (hit) mgShowTooltip(hit, sx, sy); else mgHideTooltip();
      mgCanvas.style.cursor = hit ? "pointer" : "grab";
    } else if (hit) {
      mgShowTooltip(hit, sx, sy);
    }
  });

  window.addEventListener("mouseup", function() { mgPanning = false; });

  mgCanvas.addEventListener("click", function(e) {
    if (mgPanMoved) return;
    var rect = mgCanvas.getBoundingClientRect();
    var pos = mgScreenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    var hit = mgHitTest(pos.x, pos.y);
    if (hit) {
      mgShowDetail(hit);
    } else {
      mgClearSelection();
    }
  });

  mgCanvas.addEventListener("mouseleave", function() {
    mgHovered = null;
    mgHideTooltip();
  });

  mgCanvas.addEventListener("wheel", function(e) {
    e.preventDefault();
    // A pinch arrives as ctrl or meta and zooms; anything else pans.
    if (e.ctrlKey || e.metaKey) {
      var factor = e.deltaY > 0 ? 0.92 : 1.08;
      mgZoom = Math.max(Math.min(mgMinZoom, 0.05), Math.min(5, mgZoom * factor));
    } else {
      mgCamX -= e.deltaX / mgZoom;
      mgCamY -= e.deltaY / mgZoom;
    }
    mgHideTooltip();
    mgScheduleRedraw();
  }, { passive: false });

  document.getElementById("mg-zoom-in").addEventListener("click", function() {
    window.__ndTrack?.("graph_zoomed");
    mgZoom = Math.min(5, mgZoom * 1.2);
    mgScheduleRedraw();
  });
  document.getElementById("mg-zoom-out").addEventListener("click", function() {
    window.__ndTrack?.("graph_zoomed");
    mgZoom = Math.max(Math.min(mgMinZoom, 0.05), mgZoom / 1.2);
    mgScheduleRedraw();
  });
  document.getElementById("mg-zoom-range").addEventListener("input", function(e) {
    mgZoom = Math.max(Math.min(mgMinZoom, 0.05), Number(e.target.value) / 100);
    mgScheduleRedraw();
  });
  document.getElementById("mg-zoom-value").addEventListener("click", function() {
    mgCenterCamera();
    mgScheduleRedraw();
  });
  document.getElementById("mg-recenter").addEventListener("click", function() {
    window.__ndTrack?.("graph_recentered");
    mgCenterCamera();
    mgScheduleRedraw();
  });

  var searchEl = document.getElementById("mg-search");
  searchEl.addEventListener("input", function(e) {
    mgApplySearch(e.target.value);
    mgFilterTree(e.target.value);
  });

  document.getElementById("mg-globals").addEventListener("change", function(e) {
    mgShowGlobals = e.target.checked;
    var legend = document.getElementById("legend-global-reach");
    if (legend) legend.style.display = mgShowGlobals ? "flex" : "none";
    mgScheduleRedraw();
  });

  document.getElementById("mg-show-external").addEventListener("change", function(e) {
    mgHideExternal = !e.target.checked;
    mgApplyExternalVisibility();
  });

  document.getElementById("mg-sidebar-collapse").addEventListener("click", function() {
    window.__ndTrack?.("graph_sidebar_toggled");
    document.getElementById("tab-modules").classList.add("mg-sidebar-collapsed");
    mgResize();
  });
  document.getElementById("mg-sidebar-show").addEventListener("click", function() {
    document.getElementById("tab-modules").classList.remove("mg-sidebar-collapsed");
    mgResize();
  });
  document.getElementById("mg-expand-all").addEventListener("click", function() { window.__ndTrack?.("module_tree_expanded"); mgSetAllTree(true); });
  document.getElementById("mg-collapse-all").addEventListener("click", function() { mgSetAllTree(false); });

  document.getElementById("mg-info").addEventListener("click", function(ev) {
    ev.stopPropagation();
    document.getElementById("mg-info-pop").classList.toggle("visible");
  });
  document.addEventListener("click", function(ev) {
    var pop = document.getElementById("mg-info-pop");
    if (pop && pop.classList.contains("visible") && !pop.contains(ev.target)) {
      pop.classList.remove("visible");
    }
  });

  document.getElementById("mg-resizer").addEventListener("mousedown", function(ev) {
    ev.preventDefault();
    var sidebarEl = document.getElementById("mg-sidebar");
    var startX = ev.clientX;
    var startW = sidebarEl.getBoundingClientRect().width;
    document.body.classList.add("mg-resizing");
    function onMove(mv) {
      var w = Math.max(240, Math.min(640, startW + (mv.clientX - startX)));
      sidebarEl.style.width = w + "px";
      sidebarEl.style.minWidth = w + "px";
      mgResize();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("mg-resizing");
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  document.getElementById("detail-sections").addEventListener("mouseover", function(ev) {
    var row = ev.target.closest(".md-import-row, .md-usedby-row");
    var isImport = row !== null && row.classList.contains("md-import-row");
    var nextImport = isImport ? row.dataset.import : null;
    var nextUsedBy = row !== null && !isImport ? row.dataset.module : null;
    if (nextImport !== mgHoverImport || nextUsedBy !== mgHoverUsedBy) {
      mgHoverImport = nextImport;
      mgHoverUsedBy = nextUsedBy;
      if (nextImport !== null || nextUsedBy !== null) mgStartHoverAnim();
      mgScheduleRedraw();
    }
  });
  document.getElementById("detail-sections").addEventListener("mouseleave", function() {
    if (mgHoverImport !== null || mgHoverUsedBy !== null) {
      mgHoverImport = null;
      mgHoverUsedBy = null;
      mgScheduleRedraw();
    }
  });

  document.getElementById("detail-sections").addEventListener("click", function(ev) {
    var cycleRow = ev.target.closest(".md-cycle-row");
    if (cycleRow) {
      var names = cycleRow.dataset.cycle.split("|");
      mgCycleFocus = {};
      for (var c = 0; c < names.length; c++) mgCycleFocus[names[c]] = true;
      mgFitNodes(names);
      return;
    }
    var more = ev.target.closest(".md-blast-more-toggle");
    if (!more) return;
    var hidden = more.parentElement.querySelectorAll(".md-blast-hidden");
    for (var h = 0; h < hidden.length; h++) hidden[h].classList.remove("md-blast-hidden");
    more.style.display = "none";
  });

  document.getElementById("mg-dock-header").addEventListener("click", function(ev) {
    var dock = document.getElementById("mg-dock");
    var tabEl = ev.target.closest(".mg-dock-tab");
    if (tabEl && !(dock.classList.contains("open") && dock.dataset.active === tabEl.dataset.dockTab)) {
      mgDockShow(tabEl.dataset.dockTab);
      return;
    }
    var open = dock.classList.toggle("open");
    document.getElementById("mg-dock-chevron").textContent = open ? "\\u25BE" : "\\u25B4";
    mgResize();
  });

  document.getElementById("mg-trace-body").addEventListener("click", function(ev) {
    var row = ev.target.closest(".mg-trace-expandable");
    if (!row) return;
    var path = row.dataset.path;
    if (row.classList.contains("expanded")) {
      row.classList.remove("expanded");
      var next = row.nextElementSibling;
      while (next && next.dataset && next.dataset.path &&
             next.dataset.path.indexOf(path + "/") === 0) {
        var gone = next;
        next = next.nextElementSibling;
        gone.remove();
      }
    } else {
      row.classList.add("expanded");
      var node = mgTraceNode(row.dataset.trace);
      if (!node) return;
      var depth = parseInt(row.dataset.depth, 10) + 1;
      var parentMark = row.dataset.mark || null;
      var html = "";
      for (var i = 0; i < node.deps.length; i++) {
        var depId = node.deps[i];
        // A dep with its own top-level row is detailed there, not paid again here.
        var mode = parentMark || (mgTraceTopIds[depId] === true ? "listed" : null);
        html += mgTraceRowHtml(depId, depth, path + "/" + depId, mode);
      }
      row.insertAdjacentHTML("afterend", html);
    }
    mgResize();
  });

  document.getElementById("detail-badges").addEventListener("click", function(ev) {
    if (ev.target.closest("#detail-timings-btn")) mgOpenTraceDrawer();
  });

  window.addEventListener("resize", function() { if (activeTab === "modules") mgResize(); });
}

// ── Modules graph: schema-style sidebar tree ──
var MG_PROJECT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

function mgBuildTree() {
  var treeEl = document.getElementById("mg-tree");
  var byProject = {};
  for (var i = 0; i < mgNodes.length; i++) {
    var p = mgNodes[i].project || "modules";
    (byProject[p] = byProject[p] || []).push(mgNodes[i]);
  }
  var names = Object.keys(byProject).sort(function(a, b) {
    if (a === MG_EXTERNAL_PROJECT) return 1;
    if (b === MG_EXTERNAL_PROJECT) return -1;
    return a < b ? -1 : 1;
  });
  document.getElementById("mg-project-count").textContent = String(names.length);
  var html = "";
  for (var j = 0; j < names.length; j++) {
    var pname = names[j];
    var mods = byProject[pname].slice().sort(function(a, b) {
      return getDisplayName(a) < getDisplayName(b) ? -1 : 1;
    });
    html += RPT.treeRow({
      depth: 0,
      toggleId: "mgp-" + j,
      icon: MG_PROJECT_ICON,
      label: '<span class="st-entity-name">' + mgEsc(pname) + '</span>',
      extra: '<span class="st-count">' + mods.length + '</span>',
      classes: "mg-tree-project",
      dataAttrs: ' data-project="' + mgEsc(pname) + '"'
    });
    html += '<div class="st-children" id="mgp-' + j + '">';
    for (var k = 0; k < mods.length; k++) {
      var n = mods[k];
      html += RPT.treeRow({
        depth: 1,
        label: mgEsc(getDisplayName(n)),
        extra: circularModules.has(n.name) ? '<span class="st-count" style="color:var(--nest-red)">cycle</span>' : "",
        classes: "mg-tree-module",
        dataAttrs: ' data-module="' + mgEsc(n.name) + '"'
      });
    }
    html += '</div>';
  }
  treeEl.innerHTML = html;

  treeEl.addEventListener("click", function(ev) {
    var row = ev.target.closest(".st-row");
    if (!row) return;
    if (row.classList.contains("mg-tree-project")) {
      var toggle = row.querySelector(".st-toggle");
      var kids = document.getElementById(toggle.dataset.toggle);
      var open = kids.classList.toggle("st-open");
      toggle.textContent = open ? "\\u25BE" : "\\u25B8";
      return;
    }
    var node = mgNodeMap[row.dataset.module];
    if (node) { window.__ndTrack?.("module_opened_from_tree"); mgShowDetail(node); mgFlyToNode(node); mgScheduleRedraw(); }
  });
}

function mgApplyExternalVisibility() {
  document.getElementById("tab-modules").classList.toggle("mg-ext-hidden", mgHideExternal);
  if (mgHideExternal && mgSelected && mgSelected.external) mgClearSelection();
  var rows = document.querySelectorAll('.mg-tree-project[data-project="' + MG_EXTERNAL_PROJECT + '"]');
  for (var r = 0; r < rows.length; r++) {
    rows[r].style.display = mgHideExternal ? "none" : "";
    var kids = document.getElementById(rows[r].querySelector(".st-toggle").dataset.toggle);
    if (kids) kids.style.display = mgHideExternal ? "none" : "";
  }
  var search = document.getElementById("mg-search");
  mgFilterTree(search ? search.value : "");
  mgScheduleRedraw();
}

function mgSetAllTree(open) {
  var treeEl = document.getElementById("mg-tree");
  var kids = treeEl.querySelectorAll(".st-children");
  for (var i = 0; i < kids.length; i++) kids[i].classList.toggle("st-open", open);
  var tgs = treeEl.querySelectorAll(".st-toggle");
  for (var j = 0; j < tgs.length; j++) tgs[j].textContent = open ? "\\u25BE" : "\\u25B8";
}

function mgSyncTree(n) {
  var treeEl = document.getElementById("mg-tree");
  if (!treeEl) return;
  var rows = treeEl.querySelectorAll(".mg-tree-module");
  var hit = null;
  for (var i = 0; i < rows.length; i++) {
    var selected = n !== null && rows[i].dataset.module === n.name;
    rows[i].classList.toggle("st-selected", selected);
    if (selected) hit = rows[i];
  }
  if (!hit) return;
  var kids = hit.parentElement;
  if (!kids.classList.contains("st-open")) {
    kids.classList.add("st-open");
    var prev = kids.previousElementSibling;
    var tg = prev && prev.querySelector(".st-toggle");
    if (tg) tg.textContent = "\\u25BE";
  }
  hit.scrollIntoView({ block: "nearest" });
}

function mgFilterTree(raw) {
  var q = (raw || "").trim().toLowerCase();
  var treeEl = document.getElementById("mg-tree");
  var projects = treeEl.querySelectorAll(".mg-tree-project");
  for (var i = 0; i < projects.length; i++) {
    var prow = projects[i];
    if (mgHideExternal && prow.dataset.project === MG_EXTERNAL_PROJECT) continue;
    var toggle = prow.querySelector(".st-toggle");
    var kids = document.getElementById(toggle.dataset.toggle);
    var mods = kids.querySelectorAll(".mg-tree-module");
    var pMatch = q !== "" && prow.dataset.project.toLowerCase().indexOf(q) >= 0;
    var any = false;
    for (var k = 0; k < mods.length; k++) {
      var show = q === "" || pMatch || mods[k].dataset.module.toLowerCase().indexOf(q) >= 0;
      mods[k].style.display = show ? "" : "none";
      if (show) any = true;
    }
    var showProject = q === "" || pMatch || any;
    prow.style.display = showProject ? "" : "none";
    if (q !== "" && showProject) {
      kids.classList.add("st-open");
      toggle.textContent = "\\u25BE";
    }
  }
}

// ── Modules graph: problems drawer ──
// Rules tagged module-graph only (builtin or custom); code-level findings
// stay on the Diagnosis tab.
function mgIsModuleRule(diag) {
  return Array.isArray(diag.tags) && diag.tags.indexOf("module-graph") >= 0;
}

function mgBuildProblems() {
  var listEl = document.getElementById("mg-problems-list");
  var fileToModule = {};
  for (var i = 0; i < mgNodes.length; i++) fileToModule[mgNodes[i].filePath] = mgNodes[i].name;
  for (var j = 0; j < providers.length; j++) {
    var pr = providers[j];
    if (pr.module && pr.filePath && !fileToModule[pr.filePath]) fileToModule[pr.filePath] = pr.module;
  }
  var rows = [];
  for (var d = 0; d < diagnostics.length; d++) {
    if (!mgIsModuleRule(diagnostics[d])) continue;
    var owner = fileToModule[diagnostics[d].filePath];
    if (!owner) continue;
    rows.push({ diag: diagnostics[d], module: owner });
  }
  rows.sort(function(a, b) {
    return (SEV_ORDER[a.diag.severity] || 0) - (SEV_ORDER[b.diag.severity] || 0);
  });
  document.getElementById("mg-problems-count").textContent = String(rows.length);
  var html = "";
  for (var r = 0; r < rows.length; r++) {
    var di = rows[r].diag;
    var mod = rows[r].module;
    html += '<div class="mg-problem-row' + (mod ? " mg-problem-linked" : "") + '"' +
      (mod ? ' data-module="' + mgEsc(mod) + '"' : "") + '>' +
      '<span class="mg-problem-sev mg-sev-' + mgEsc(di.severity) + '"></span>' +
      '<span class="mg-problem-msg">' + mgEsc(di.message) + '</span>' +
      '<span class="mg-problem-rule">' + mgEsc(di.rule || "") + '</span>' +
      (mod ? '<span class="mg-problem-module">' + mgEsc(mod) + '</span>' : "") +
      '</div>';
  }
  listEl.innerHTML = html || '<div class="md-empty" style="padding:8px 14px">No problems.</div>';
  listEl.addEventListener("click", function(ev) {
    var row = ev.target.closest(".mg-problem-linked");
    if (!row) return;
    var node = mgNodeMap[row.dataset.module];
    if (node) { window.__ndTrack?.("module_opened_from_finding"); mgShowDetail(node); mgFlyToNode(node); mgScheduleRedraw(); }
  });
}

function renderModules() {
  mgCanvas = document.getElementById("graph");
  mgCtx = mgCanvas.getContext("2d");
  mgBuild();
  mgBuildTree();
  mgBuildProblems();
  mgRenderPhases();
  mgSyncTraceDrawer(null);
  mgApplyExternalVisibility();
  if (mgNodes.length === 0) {
    document.getElementById("mg-empty-state").classList.add("visible");
  }
  if (graph.projects.length > 0) {
    var xl = document.getElementById("legend-cross");
    if (xl) xl.style.display = "flex";
  }
  mgResize();
  mgCenterCamera();
  mgBindEvents();
  mgScheduleRedraw();
}

// ── Modules graph: detail panel ──
function mgEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

var MG_INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

function mgSection(title, count, tip) {
  var info = tip ? ' <span class="md-info">' + MG_INFO_ICON + '</span>' : "";
  return RPT.heading({ level: 4, classes: tip ? "tip-wide" : undefined, tip: tip ? mgEsc(tip) : undefined,
    text: mgEsc(title) + (count === undefined ? "" : " (" + count + ")") + info });
}

function mgWiringTree(deps, depth) {
  var kids = mgWiringChildren(deps);
  if (kids.length === 0) return "";
  var html = '<ul class="md-tree">';
  for (var i = 0; i < kids.length; i++) {
    var d = kids[i];
    var label = mgEsc(d.className) + (d.methodName ? '<span style="color:#777">.' + mgEsc(d.methodName) + '</span>' : "");
    var badge = '<span class="md-dep-type md-t-' + mgEsc(d.type) + '">' + mgEsc(d.type) + '</span>';
    html += '<li style="padding-left:' + (depth * 12) + 'px">' +
      '<div class="md-tree-row"><span class="md-tree-elbow">\\u2514</span>' +
      '<span class="md-tree-label">' + label + '</span>' + badge + '</div>';
    var sub = mgWiringChildren(d.dependencies);
    if (sub.length > 0) {
      if (depth >= 2) {
        html += '<details><summary class="md-more">' + sub.length + ' deeper</summary>' +
          mgWiringTree(d.dependencies, 0) + '</details>';
      } else {
        html += mgWiringTree(d.dependencies, depth + 1);
      }
    }
    html += '</li>';
  }
  return html + '</ul>';
}

function mgWiringHtml(n) {
  if (n.controllers.length === 0) {
    return '<div class="md-empty">No controllers in this module.</div>';
  }
  var html = "", traced = 0;
  for (var i = 0; i < n.controllers.length; i++) {
    var ctrl = n.controllers[i];
    var eps = mgEndpointsOf(ctrl);
    if (eps.length === 0) {
      html += '<div class="md-ctrl"><div class="md-ctrl-name">' + mgEsc(ctrl) + '</div>' +
        '<div class="md-empty">No traced endpoints.</div></div>';
    } else {
      html += '<details class="md-ctrl md-ctrl-details"><summary class="md-ctrl-name">' +
        '<span class="md-ep-caret">\\u25B8</span>' + mgEsc(ctrl) +
        '<span class="md-subcount" style="margin-left:6px">' + eps.length +
        (eps.length === 1 ? ' route' : ' routes') + '</span></summary>';
      traced += eps.length;
      for (var j = 0; j < eps.length; j++) {
        var ep = eps[j];
        var verb = (ep.httpMethod || "GET").toLowerCase();
        var verbClass = verb === "route" ? "md-verb-multi" : "md-" + mgEsc(verb);
        var epRow = '<span class="md-verb ' + verbClass + '">' + mgEsc((ep.httpMethod || "GET").toUpperCase()) + '</span>' +
          '<span class="md-route">' + mgEsc(ep.routePath || "/") + '</span>' +
          '<span style="color:#666;font-size:10px"> \\u00b7 ' + mgEsc(ep.handlerMethod) + '</span>';
        var tree = mgWiringTree(ep.dependencies, 0);
        if (tree === "") {
          html += '<div class="md-ep">' + epRow + '</div>';
        } else {
          html += '<details class="md-endpoint"><summary class="md-ep">' +
            '<span class="md-ep-caret">\\u25B8</span>' + epRow + '</summary>' +
            tree + '</details>';
        }
      }
      html += '</details>';
    }
  }
  if (traced === 0) {
    html += '<div class="md-note">Endpoint tracing found no handlers for these controllers \\u2014 a custom controller decorator can hide them from the scanner.</div>';
  }
  return html;
}

function mgUsedByHtml(n) {
  var sources = mgImporters[n.name] || [];
  if (sources.length === 0) {
    return '<div class="md-empty">Nothing imports this module.</div>';
  }
  var byProject = {}, order = [];
  for (var i = 0; i < sources.length; i++) {
    var src = mgNodeMap[sources[i]];
    var p = (src && src.project) || "";
    if (!byProject[p]) { byProject[p] = []; order.push(p); }
    byProject[p].push({ full: sources[i], label: src ? getDisplayName(src) : sources[i] });
  }
  order.sort();
  var html = "";
  for (var j = 0; j < order.length; j++) {
    var key = order[j];
    if (key) {
      html += '<div class="md-row" style="margin-top:4px"><span class="md-badge md-project">' + mgEsc(key) + '</span></div>';
    }
    byProject[key].sort(function(a, b) { return a.label < b.label ? -1 : 1; });
    html += '<ul>';
    for (var k = 0; k < byProject[key].length; k++) {
      html += '<li class="md-usedby-row" data-module="' + mgEsc(byProject[key][k].full) + '">' + mgEsc(byProject[key][k].label) + '</li>';
    }
    html += '</ul>';
  }
  return html;
}

function mgBlastHtml(n) {
  var blast = mgBlastRadius(n.name, mgImporters, function(name) {
    var node = mgNodeMap[name];
    return node ? node.project : "";
  });
  if (blast.names.length === 0) {
    return '<div class="md-empty">Nothing depends on this module, directly or otherwise.</div>';
  }
  var headline = 'Reaches <strong>' + blast.names.length + '</strong> module' +
    (blast.names.length === 1 ? "" : "s");
  if (graph.projects.length > 0) {
    headline += ' across <strong>' + blast.projectCount + '</strong> project' +
      (blast.projectCount === 1 ? "" : "s");
  }
  var html = '<div class="md-blast-headline">' + headline + '</div>';

  var directSet = {};
  var importers = mgImporters[n.name] || [];
  for (var d = 0; d < importers.length; d++) directSet[importers[d]] = true;
  var direct = [], indirect = [];
  for (var i = 0; i < blast.names.length; i++) {
    (directSet[blast.names[i]] ? direct : indirect).push(blast.names[i]);
  }

  // BFS parents over the reverse-import graph for chain reconstruction.
  var parent = {}, seen = {}, queue = [n.name];
  seen[n.name] = true;
  while (queue.length) {
    var cur = queue.shift();
    var imps = mgImporters[cur] || [];
    for (var q = 0; q < imps.length; q++) {
      if (!seen[imps[q]]) {
        seen[imps[q]] = true;
        parent[imps[q]] = cur;
        queue.push(imps[q]);
      }
    }
  }
  function chainOf(name) {
    var hops = [], cur = parent[name];
    while (cur !== undefined && cur !== n.name) {
      hops.push(mgNodeMap[cur] ? getDisplayName(mgNodeMap[cur]) : cur);
      cur = parent[cur];
    }
    return hops.reverse();
  }

  html += mgBlastGroupHtml("Direct", direct,
    "Modules that import " + getDisplayName(n) + " themselves.", null);
  html += mgBlastGroupHtml("Indirect", indirect,
    "Modules that reach it through a chain of imports.", chainOf);
  return html;
}

function mgBlastGroupHtml(label, names, tip, chainOf) {
  if (names.length === 0) return "";
  var byProject = {}, order = [];
  for (var i = 0; i < names.length; i++) {
    var node = mgNodeMap[names[i]];
    var p = (node && node.project) || "this project";
    if (byProject[p] === undefined) { byProject[p] = []; order.push(p); }
    var via = chainOf ? chainOf(names[i]) : [];
    byProject[p].push({
      label: node ? getDisplayName(node) : names[i],
      via: via.length ? "via " + via.join(" \\u2192 ") : "",
    });
  }
  order.sort(function(a, b) { return byProject[b].length - byProject[a].length; });
  var html = '<div class="md-subhead has-tip tip-wide" data-tip="' + mgEsc(tip) + '">' +
    label + '<span class="md-subcount">' + names.length + '</span></div>';
  html += '<div class="md-group">';
  for (var k = 0; k < order.length; k++) {
    var mods = byProject[order[k]];
    var tipLines = [];
    for (var t = 0; t < mods.length && t < 14; t++) {
      tipLines.push(mods[t].label + (mods[t].via ? " \\u00b7 " + mods[t].via : ""));
    }
    if (mods.length > 14) tipLines.push("+ " + (mods.length - 14) + " more");
    html += '<details class="md-blast-proj-details' + (k >= 8 ? " md-blast-hidden" : "") + '">' +
      '<summary class="md-blast-row">' +
      '<span class="md-ep-caret">\\u25B8</span>' +
      '<span class="md-blast-pill has-tip tip-right tip-list" data-tip="' + mgEsc(tipLines.join("\\n")) + '">' + mods.length + '</span>' +
      '<span class="md-blast-proj">' + mgEsc(order[k]) + '</span></summary><ul class="md-blast-mods">';
    for (var m = 0; m < mods.length; m++) {
      html += '<li>' + mgEsc(mods[m].label) +
        (mods[m].via ? ' <span class="md-blast-count">' + mgEsc(mods[m].via) + '</span>' : "") + '</li>';
    }
    html += '</ul></details>';
  }
  if (order.length > 8) {
    html += '<div class="md-more md-blast-more-toggle">+ ' + (order.length - 8) + ' more projects</div>';
  }
  return html + '</div>';
}

/** Token + strategy out of an object-literal provider kept as raw text. */
function mgParseObjectProvider(raw) {
  var provide = raw.match(/provide\\s*:\\s*([^,}]+)/);
  var use = raw.match(/(useExisting|useClass|useFactory|useValue)\\s*:?\\s*([A-Za-z0-9_$.]+)?/);
  var token = provide ? provide[1].trim() : raw;
  var q = token.charAt(0);
  if ((q === '"' || q === "'") && token.charAt(token.length - 1) === q) {
    token = token.slice(1, -1);
  }
  return {
    token: token,
    strategy: use ? use[1] : null,
    target: use && use[2] ? use[2] : null,
  };
}

/** Class providers bucketed by suffix, object-literal providers folded into their token. */
function mgProviderGroups(n) {
  var groups = { Services: [], Repositories: [], Others: [] };
  var tokenRows = {};
  for (var i = 0; i < n.providers.length; i++) {
    var raw = n.providers[i];
    if (raw.charAt(0) === "{") {
      var p = mgParseObjectProvider(raw);
      tokenRows[p.token] = p;
      continue;
    }
    var g = /Service$/.test(raw) ? "Services" : /Repository$/.test(raw) ? "Repositories" : "Others";
    groups[g].push({ name: raw });
  }
  var tokens = n.providerTokens || [];
  for (var j = 0; j < tokens.length; j++) {
    if (!tokenRows[tokens[j]]) tokenRows[tokens[j]] = { token: tokens[j], strategy: null, target: null };
  }
  var count = groups.Services.length + groups.Repositories.length + groups.Others.length;
  var tokenNames = Object.keys(tokenRows);
  for (var k = 0; k < tokenNames.length; k++) groups.Others.push(tokenRows[tokenNames[k]]);
  return { groups: groups, count: count + tokenNames.length };
}

var MG_DYNAMIC_TIPS = {
  forRoot: "Configures the module once for the whole app",
  forRootAsync: "forRoot with config resolved asynchronously at boot",
  forFeature: "Adds this module's own piece; forRoot did the app-wide setup",
  forFeatureAsync: "forFeature with config resolved asynchronously",
  register: "Configures the module for this consumer only",
  registerAsync: "register with config resolved asynchronously",
};

var MG_GROUP_KIND = { Services: "service", Repositories: "repo" };

function mgKindOf(name) {
  if (mgNodeMap[name] || /Module$/.test(name)) return "module";
  if (/Service$/.test(name)) return "service";
  if (/Repository$/.test(name)) return "repo";
  return "";
}

function mgSubheadHtml(group, count) {
  var kind = MG_GROUP_KIND[group] || "";
  return '<div class="md-subhead' + (kind ? " md-kind-" + kind : "") + '">' +
    group + '<span class="md-subcount">' + count + '</span></div>';
}

function mgNameHtml(name, kind) {
  return '<span class="md-row-name' + (kind ? " md-kind-" + kind : "") + '">' + mgEsc(name) + '</span>';
}

function mgProvidersHtml(n) {
  var owned = mgProvidersOf(n.name);
  var byName = {};
  for (var i = 0; i < owned.length; i++) byName[owned[i].name] = owned[i];

  var pv = mgProviderGroups(n);
  if (pv.count === 0) {
    return '<div class="md-empty">No providers.</div>';
  }
  var html = "";
  var order = ["Services", "Repositories", "Others"];
  for (var g = 0; g < order.length; g++) {
    var rows = pv.groups[order[g]];
    if (rows.length === 0) continue;
    html += mgSubheadHtml(order[g], rows.length);
    html += '<div class="md-group">';
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      if (row.token) {
        html += '<div class="md-row">' + mgNameHtml(row.token, "") +
          RPT.badge({ variant: "md-token", text: "token" }) +
          (row.strategy && row.target
            ? RPT.badge({ variant: "md-use", text: mgEsc(row.strategy) + ' \\u2192 ' + mgEsc(row.target) })
            : "") +
          '</div>';
        continue;
      }
      var info = byName[row.name];
      html += '<div class="md-row">' + mgNameHtml(row.name, MG_GROUP_KIND[order[g]] || "");
      if (info && info.scope) {
        html += RPT.badge({ variant: "md-scope", text: mgEsc(info.scope) });
      }
      if (mgUnusedProviders[row.name]) {
        html += RPT.badge({ variant: "md-unused", title: "performance/no-unused-providers: never injected and not framework-activated", text: "unused?" });
      }
      if (info && info.publicMethodCount) {
        html += '<span class="md-blast-count">' + info.publicMethodCount + ' methods</span>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  return html;
}

var mgTraceMax = 1;
var MG_TRACE_COLORS = {
  provider: "34,211,238",
  controller: "167,139,250",
  injectable: "52,211,153",
  middleware: "244,114,182"
};

function mgTraceNode(id) {
  return Object.prototype.hasOwnProperty.call(graph.timingsTrace, id)
    ? graph.timingsTrace[id] : null;
}

function mgTraceColor(type) {
  return Object.prototype.hasOwnProperty.call(MG_TRACE_COLORS, type)
    ? MG_TRACE_COLORS[type] : "107,114,128";
}

var MG_HOOK_META = {
  onModuleInit: { label: "init", rgb: "52,211,153" },
  onApplicationBootstrap: { label: "bootstrap", rgb: "167,139,250" }
};

function mgHookChipHtml(hooks) {
  if (!hooks || hooks.length === 0) return "";
  var html = "";
  for (var i = 0; i < hooks.length; i++) {
    var h = hooks[i];
    var meta = Object.prototype.hasOwnProperty.call(MG_HOOK_META, h.hook)
      ? MG_HOOK_META[h.hook]
      : { label: h.hook, rgb: "107,114,128" };
    var times = h.count && h.count > 1 ? " across " + h.count + " instances" : "";
    html += '<span class="mg-trace-hook" style="color:rgb(' + meta.rgb + ');background:rgba(' + meta.rgb + ',0.12)"' +
      ' data-tip="' + mgEsc(h.hook + " took " + mgFormatMs(h.ms) + times) + '">+' +
      mgEsc(mgFormatMs(h.ms)) + ' ' + mgEsc(meta.label) +
      (h.count && h.count > 1 ? ' \\u00d7' + h.count : '') + '</span>';
  }
  return html;
}

function mgPhaseParts() {
  var p = graph.phases;
  // Without createMs the earlier boundaries are unknown, so segments would mislabel.
  if (!p || typeof p.createMs !== "number") return [];
  var parts = [];
  var prev = 0;
  function push(label, end, rgb, tip) {
    if (typeof end !== "number" || end <= prev) return;
    parts.push({ label: label, ms: end - prev, rgb: rgb, tip: tip });
    prev = end;
  }
  push("create", p.createMs, "34,211,238", "create \\u2014 constructing providers and controllers");
  if (typeof p.moduleInitMs === "number") {
    push("onModuleInit", p.moduleInitMs, "52,211,153", "onModuleInit \\u2014 hooks across all classes");
    push("onApplicationBootstrap", p.initMs, "167,139,250", "onApplicationBootstrap \\u2014 hooks across all classes");
  } else {
    push("lifecycle hooks", p.initMs, "52,211,153", "lifecycle hooks \\u2014 onModuleInit and onApplicationBootstrap");
  }
  if (typeof graph.startupMs === "number") {
    var tail = typeof p.initMs === "number"
      ? { label: "listen", tip: "listen \\u2014 binding the HTTP server" }
      : typeof p.moduleInitMs === "number"
        ? { label: "bootstrap + listen", tip: "bootstrap + listen \\u2014 onApplicationBootstrap hooks and the server bind" }
        : { label: "hooks + listen", tip: "hooks + listen \\u2014 everything after NestFactory.create" };
    push(tail.label, graph.startupMs, "107,114,128", tail.tip);
  }
  return parts;
}

function mgRenderPhases() {
  var el = document.getElementById("mg-trace-phases");
  if (!el) return;
  var parts = mgPhaseParts();
  var total = 0;
  for (var i = 0; i < parts.length; i++) total += parts[i].ms;
  if (parts.length === 0 || total <= 0) {
    el.innerHTML = "";
    return;
  }
  var html = '<div class="mg-phase-strip">';
  var caption = "";
  for (var j = 0; j < parts.length; j++) {
    var seg = parts[j];
    html += '<span class="mg-phase-seg" style="width:' + ((seg.ms / total) * 100).toFixed(2) +
      '%;background:rgba(' + seg.rgb + ',0.4)" data-tip="' + mgEsc(seg.tip) + '"></span>';
    caption += (j > 0 ? " \\u00b7 " : "") +
      '<span style="color:rgb(' + seg.rgb + ')">' + mgEsc(seg.label) + '</span> ' +
      mgEsc(mgFormatMs(seg.ms));
  }
  html += '</div><div class="mg-trace-note">' + caption + '</div>';
  el.innerHTML = html;
}

function mgDockShow(name) {
  document.getElementById("mg-dock").dataset.active = name;
  var dock = document.getElementById("mg-dock");
  if (!dock.classList.contains("open")) {
    dock.classList.add("open");
    document.getElementById("mg-dock-chevron").textContent = "\\u25BE";
  }
  mgResize();
}

function mgTraceBadgeHtml(type) {
  var rgb = mgTraceColor(type);
  return RPT.badge({
    style: "color:rgb(" + rgb + ");background:rgba(" + rgb + ",0.12)",
    text: mgEsc(type)
  });
}

function mgTraceBarHtml(initTime, deps, type, hollowTip) {
  var frac = Math.max(0, Math.min(1, initTime / mgTraceMax));
  var width = (frac * 100).toFixed(2);
  if (hollowTip) {
    return '<span class="mg-trace-track" data-tip="' + mgEsc(mgFormatMs(initTime) + " total \\u2014 " + hollowTip) + '">' +
      '<span class="mg-trace-bar" style="width:' + width + '%;background:transparent;box-shadow:inset 0 0 0 1px rgba(' + mgTraceColor(type) + ',0.5)"></span>' +
      '</span>';
  }
  // Slowest dep this class could actually have waited on: a dep slower than
  // the class itself was pre-built, so it never entered this class's clock.
  var slowestDep = 0;
  for (var d = 0; d < deps.length; d++) {
    var dep = mgTraceNode(deps[d]);
    if (dep && dep.initTime <= initTime) { slowestDep = dep.initTime; break; }
  }
  var selfFrac = Math.max(0, Math.min(frac, (initTime - slowestDep) / mgTraceMax));
  var tip = mgFormatMs(initTime) + " total" +
    (slowestDep > 0 ? " \\u2014 \\u2248" + mgFormatMs(slowestDep) + " waiting on dependencies, \\u2248" + mgFormatMs(Math.max(0, initTime - slowestDep)) + " own work" : " \\u2014 all own work");
  return '<span class="mg-trace-track" data-tip="' + mgEsc(tip) + '">' +
    '<span class="mg-trace-bar" style="width:' + width + '%;background:rgba(' + mgTraceColor(type) + ',0.4)"></span>' +
    (selfFrac > 0.002 ? '<span class="mg-trace-self" style="left:' + ((frac - selfFrac) * 100).toFixed(2) + '%;width:' + (selfFrac * 100).toFixed(2) + '%"></span>' : '') +
    '</span>';
}

function mgTraceRowHtml(id, depth, path, mode) {
  var node = mgTraceNode(id);
  if (!node) return "";
  var ancestors = path.split("/");
  ancestors.pop();
  var cyc = ancestors.indexOf(id) >= 0;
  var expandable = !cyc && depth < 20 && node.deps.length > 0;
  // Slower than its consumer means the dep already existed when the consumer loaded.
  var parent = ancestors.length > 0 ? mgTraceNode(ancestors[ancestors.length - 1]) : null;
  var reused = mode === "reused" || (parent !== null && node.initTime > parent.initTime);
  var listed = !reused && mode === "listed";
  var mark = reused
    ? { cls: " mg-trace-reused", tag: "reused", tip: "Already built when this parent loaded \\u2014 its cost is counted at its first consumer", bar: "already built for an earlier consumer; not paid here" }
    : listed
      ? { cls: " mg-trace-reused", tag: "listed above", tip: "Has its own row at the top of this trace \\u2014 the cost is detailed there", bar: "detailed in its own row at the top of this trace" }
      : null;
  return '<div class="mg-trace-row' + (expandable ? ' mg-trace-expandable' : '') +
    (mark ? mark.cls : '') + '"' +
    ' data-trace="' + mgEsc(id) + '" data-path="' + mgEsc(path) + '" data-depth="' + depth + '"' +
    (mark ? ' data-mark="' + (reused ? "reused" : "listed") + '"' : '') + '>' +
    '<span class="mg-trace-label" style="padding-left:' + (Math.min(depth, 8) * 16) + 'px">' +
    '<span class="mg-trace-caret">' + (expandable ? "\\u25B8" : "") + '</span>' +
    '<span class="mg-trace-name" data-tip="' + mgEsc(node.name) + '">' + mgEsc(node.name) + '</span>' +
    mgTraceBadgeHtml(node.type) +
    mgHookChipHtml(node.hooks) +
    (mark ? '<span class="mg-trace-reused-tag" data-tip="' + mark.tip + '">' + mark.tag + '</span>' : '') +
    (cyc ? '<span class="mg-trace-cycle" data-tip="circular dependency">\\u21BB</span>' : '') +
    '</span>' +
    mgTraceBarHtml(node.initTime, node.deps, node.type, mark ? mark.bar : null) +
    '<span class="mg-trace-time">' + mgEsc(mgFormatMs(node.initTime)) + '</span>' +
    '</div>';
}

var mgTraceTopIds = {};

function mgShowModuleTrace(n) {
  var list = n.initTimings;
  mgTraceMax = list[0].initTime > 0 ? list[0].initTime : 1;
  mgTraceTopIds = {};
  var html = "";
  // The parser writes every timed class into the trace, so rows never miss it.
  for (var i = 0; i < list.length; i++) {
    mgTraceTopIds[list[i].id] = true;
    html += mgTraceRowHtml(list[i].id, 0, list[i].id);
  }
  document.getElementById("mg-trace-ms").textContent =
    getDisplayName(n) + " \\u00b7 " + mgFormatMs(list[0].initTime);
  document.getElementById("mg-trace-body").innerHTML = html;
}

var mgTraceSyncedName = null;

function mgSyncTraceDrawer(n) {
  var mod = n && !n.external && graph.timingsAvailable &&
    n.initTimings && n.initTimings.length > 0 ? n : null;
  var tab = document.getElementById("mg-dock-tab-trace");
  if (!graph.timingsAvailable) {
    tab.style.display = "none";
    return;
  }
  tab.style.display = "";
  if (mod) {
    // Re-selecting the same module keeps its expanded cascade rows.
    if (mgTraceSyncedName === mod.name) return;
    mgTraceSyncedName = mod.name;
    mgShowModuleTrace(mod);
  } else {
    mgTraceSyncedName = null;
    document.getElementById("mg-trace-ms").textContent = "";
    document.getElementById("mg-trace-body").innerHTML =
      '<div class="mg-trace-note">' +
      (n ? mgEsc("No timing data for " + getDisplayName(n) + " \\u2014 it was not part of the captured boot, or its module name repeats across projects.")
         : "Select a module to see its boot trace.") +
      '</div>';
  }
  mgResize();
}

function mgOpenTraceDrawer() {
  mgDockShow("trace");
}

function mgJumpToSlowestBoot() {
  switchTab("modules");
  var maxId = null;
  var maxT = -1;
  for (var e = 0, entries = Object.entries(graph.timingsTrace); e < entries.length; e++) {
    if (entries[e][1].initTime > maxT) {
      maxT = entries[e][1].initTime;
      maxId = entries[e][0];
    }
  }
  var owner = null;
  var largest = null;
  var largestT = -1;
  for (var i = 0; i < graph.modules.length; i++) {
    var m = graph.modules[i];
    if (!m.initTimings || m.initTimings.length === 0) continue;
    for (var j = 0; j < m.initTimings.length; j++) {
      if (m.initTimings[j].id === maxId) owner = m;
    }
    if (m.initTimings[0].initTime > largestT) {
      largestT = m.initTimings[0].initTime;
      largest = m;
    }
  }
  var target = owner || largest;
  var node = target && mgNodeMap[target.name];
  if (node) {
    mgShowDetail(node);
    mgFlyToNode(node);
  }
  mgOpenTraceDrawer();
  mgScheduleRedraw();
}

function mgExportsHtml(n) {
  var groups = { Services: [], Repositories: [], Others: [] };
  for (var i = 0; i < n.exports.length; i++) {
    var name = n.exports[i];
    var kind = mgKindOf(name);
    var g = "Others";
    if (kind === "service") g = "Services";
    if (kind === "repo") g = "Repositories";
    groups[g].push({ name: name, kind: kind });
  }
  var html = "";
  var order = ["Services", "Repositories", "Others"];
  for (var j = 0; j < order.length; j++) {
    var rows = groups[order[j]];
    if (rows.length === 0) continue;
    html += mgSubheadHtml(order[j], rows.length);
    html += '<div class="md-group">';
    for (var k = 0; k < rows.length; k++) {
      html += '<div class="md-row">' + mgNameHtml(rows[k].name, rows[k].kind) +
        (rows[k].kind === "module" ? RPT.badge({ variant: "md-module", text: "module" }) : "") +
        '</div>';
    }
    html += '</div>';
  }
  return html;
}

function mgCyclesHtml(n) {
  if (!circularModules.has(n.name)) return "";
  var html = RPT.heading({ level: 4, style: "color:#ea2845", text: "Circular dependencies" });
  for (var i = 0; i < graph.circularDeps.length; i++) {
    var cycle = graph.circularDeps[i];
    if (cycle.indexOf(n.name) < 0) continue;
    html += '<div class="md-cycle-row has-tip tip-wide" data-cycle="' + mgEsc(cycle.join("|")) + '"' +
      ' data-tip="Click to zoom the graph to this cycle">' +
      mgEsc(cycle.join(" \\u2192 ") + " \\u2192 " + cycle[0]) + '</div>';
    var rec = graph.circularDepRecommendations[cycle.join(",")];
    if (rec) {
      html += '<div style="margin:6px 0 10px;padding:8px;background:rgba(234,40,69,0.08);' +
        'border:1px solid rgba(234,40,69,0.2);border-radius:4px;font-size:11px;color:#ccc;' +
        'line-height:1.5;white-space:pre-wrap">' + mgEsc(rec) + '</div>';
    }
  }
  return html;
}

function mgFocusOn(n) {
  mgFocusSet = {};
  mgFocusSet[n.name] = true;
  for (var i = 0; i < mgEdges.length; i++) {
    var e = mgEdges[i];
    if (e.from === n.name) mgFocusSet[e.to] = true;
    if (e.to === n.name) mgFocusSet[e.from] = true;
  }
}

function mgClearSelection() {
  document.getElementById("detail").style.display = "none";
  document.getElementById("mg-sidebar").classList.remove("mg-detail-open");
  mgSelected = null;
  mgFocusSet = null;
  mgCycleFocus = null;
  mgSyncTraceDrawer(null);
  mgSyncTree(null);
  mgScheduleRedraw();
}

function mgShowDetail(n) {
  mgSelected = n;
  mgCycleFocus = null;
  mgFocusOn(n);
  mgStartHoverAnim();
  var tab = document.getElementById("tab-modules");
  if (tab.classList.contains("mg-sidebar-collapsed")) {
    tab.classList.remove("mg-sidebar-collapsed");
    mgResize();
  }
  mgSyncTree(n);
  document.getElementById("detail-name").textContent = getDisplayName(n);

  var badges = "";
  if (n.project) badges += RPT.badge({ variant: "md-project", text: mgEsc(n.project) });
  if (n.isGlobal) badges += RPT.badge({ variant: "md-global", text: "global" });
  if (circularModules.has(n.name)) badges += RPT.badge({ variant: "md-cycle", text: "in cycle" });
  if (rootModules.has(n.name)) badges += RPT.badge({ variant: "md-root", text: "root" });
  if (graph.timingsAvailable) {
    if (n.initTimings && n.initTimings.length > 0) {
      badges += RPT.badge({
        variant: "md-use",
        id: "detail-timings-btn",
        tip: "Open the Boot trace",
        text: mgEsc(mgFormatMs(n.initTimings[0].initTime)) + ' \\u00b7 trace \\u25B8'
      });
    }
    badges += mgHookChipHtml(n.hookTimings);
  }
  document.getElementById("detail-badges").innerHTML = badges;
  mgSyncTraceDrawer(n);

  document.getElementById("detail-path").textContent =
    n.filePath + (n.line ? ":" + n.line : "");

  var html = "";
  if (n.isGlobal) {
    html += '<div class="md-note">Marked @Global() \\u2014 its exports resolve in every module without an import.</div>';
  }
  html += mgSection("Used by", (mgImporters[n.name] || []).length,
    "Modules that import this one directly, grouped by project.") + mgUsedByHtml(n);
  html += mgSection("Blast radius", undefined,
    "What a change here can break: every module that imports this one, directly or transitively.") + mgBlastHtml(n);
  html += mgSection("Providers", mgProviderGroups(n).count,
    "What this module registers in its providers array, grouped by kind.") + mgProvidersHtml(n);
  if (n.imports.length > 0) {
    html += mgSection("Imports", n.imports.length,
      "Modules this one depends on; their exports become injectable here.") + '<ul>';
    for (var j = 0; j < n.imports.length; j++) {
      var target = mgNodeMap[n.imports[j]];
      var label = target ? getDisplayName(target) : n.imports[j];
      var method = n.dynamicImports && n.dynamicImports[n.imports[j]];
      var methodTip = method ? (MG_DYNAMIC_TIPS[method] || "Dynamic import: " + method + "() returns a configured module") : "";
      var external = !target || target.external === true;
      html += '<li class="md-import-row' + (external ? " md-import-ext" : "") + '" data-import="' + mgEsc(n.imports[j]) + '"><span class="md-kind-module">' + mgEsc(label) + '</span>' +
        (method ? RPT.badge({ variant: "md-scope", classes: "has-tip tip-wide badge-tip", style: "margin-left:5px", tip: mgEsc(methodTip), text: mgEsc(method) }) : "") +
        (external
          ? RPT.badge({
              variant: "md-ext",
              classes: "has-tip tip-wide badge-tip",
              style: "margin-left:5px",
              tip: "Not declared in this codebase \\u2014 it comes from a package, e.g. @nestjs/config",
              text: "external"
            })
          : "") +
        (target && target.project && target.project !== n.project
          ? RPT.badge({ variant: "md-project", style: "margin-left:5px", text: mgEsc(target.project) })
          : "") +
        '</li>';
    }
    html += '</ul>';
  }
  if (n.exports.length > 0) {
    html += mgSection("Exports", n.exports.length,
      "What this module makes available to the modules that import it.") + mgExportsHtml(n);
  }
  html += mgSection("Wiring", n.controllers.length,
    "This module's controllers, their endpoints, and the providers each handler calls.") + mgWiringHtml(n);
  html += mgCyclesHtml(n);

  document.getElementById("detail-sections").innerHTML = html;
  document.getElementById("detail").style.display = "block";
  document.getElementById("mg-sidebar").classList.add("mg-detail-open");
  mgScheduleRedraw();
}

document.getElementById("close-detail").addEventListener("click", () => {
  mgClearSelection();
});

`;
