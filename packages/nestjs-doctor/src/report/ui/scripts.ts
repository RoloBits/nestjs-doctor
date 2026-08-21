export interface ReportScriptData {
	diagnosticsJson: string;
	elapsedMsJson: string;
	endpointsJson: string;
	examplesJson: string;
	fileSourcesJson: string;
	graphJson: string;
	projectJson: string;
	providersJson: string;
	schemaJson: string;
	sourceLinesJson: string;
	summaryJson: string;
}

export function getReportScripts(data: ReportScriptData): string {
	return `
const graph = ${data.graphJson};
const project = ${data.projectJson};
const diagnostics = ${data.diagnosticsJson};
const sourceLinesData = ${data.sourceLinesJson};
const summary = ${data.summaryJson};
const elapsedMs = ${data.elapsedMsJson};
const ruleExamples = ${data.examplesJson};
const fileSources = ${data.fileSourcesJson};
const providers = ${data.providersJson};
const schema = ${data.schemaJson};
const endpoints = ${data.endpointsJson};
const isMonorepo = Object.keys(fileSources).length === 0;

// The payload omits empty collections, so every consumer can assume they exist.
graph.modules = graph.modules || [];
graph.edges = graph.edges || [];
graph.projects = graph.projects || [];
graph.circularDeps = graph.circularDeps || [];
graph.circularDepRecommendations = graph.circularDepRecommendations || {};
graph.bootstrapRoots = graph.bootstrapRoots || [];
graph.timingsTrace = graph.timingsTrace || {};

// ── Score helpers ──
function getScoreColor(v) {
  if (v >= 75) return "${"var(--score-green)"}";
  if (v >= 50) return "${"var(--score-yellow)"}";
  return "${"var(--score-red)"}";
}

function makeScoreRingSvg(size, strokeW, value) {
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = getScoreColor(value);
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="' + strokeW + '"/>' +
    '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + strokeW + '" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 ' + size/2 + ' ' + size/2 + ')"/>' +
    '<text x="' + size/2 + '" y="' + size/2 + '" text-anchor="middle" dominant-baseline="central" fill="' + color + '" font-size="' + Math.round(size * 0.32) + '" font-weight="700" font-family="var(--font)">' + value + '</text>' +
    '</svg>';
}

// ── Header: meta badges ──
(function() {
  const meta = document.getElementById("header-meta");
  const badges = [];
  badges.push('<span class="meta-badge">' + project.name + '</span>');
  if (project.nestVersion) badges.push('<span class="meta-badge">NestJS ' + project.nestVersion + '</span>');
  if (project.framework) badges.push('<span class="meta-badge">' + project.framework + '</span>');
  if (project.orm) badges.push('<span class="meta-badge">' + project.orm + '</span>');
  badges.push('<span class="meta-badge">' + graph.modules.length + ' modules</span>');
  if (graph.timingsAvailable) {
    let bootMs = 0;
    let bootName = "";
    for (const node of Object.values(graph.timingsTrace)) {
      if (node.initTime > bootMs) {
        bootMs = node.initTime;
        bootName = node.name;
      }
    }
    if (graph.startupMs) {
      badges.push('<span class="meta-badge" id="boot-badge" style="cursor:pointer" title="From bootstrap start until the app was listening, measured by the snippet. Slowest construction chain: ' +
        mgEsc(bootName) + ' \\u2014 click to open it in the modules graph">time to start \\u2248 ' + mgEsc(mgFormatMs(graph.startupMs)) + '</span>');
    } else if (bootMs > 0) {
      badges.push('<span class="meta-badge" id="boot-badge" style="cursor:pointer" title="Slowest construction chain: ' +
        mgEsc(bootName) + ' \\u2014 click to open it in the modules graph. Add startupMs to the dump for full time-to-start">boot \\u2248 ' + mgEsc(mgFormatMs(bootMs)) + '</span>');
    }
  }
  meta.innerHTML = badges.join("");
  const bootBadge = document.getElementById("boot-badge");
  if (bootBadge) {
    bootBadge.addEventListener("click", () => mgJumpToSlowestBoot());
  }
})();

// ── Diagnosis count badge ──
(function() {
  const badge = document.getElementById("diagnosis-count-badge");
  if (diagnostics.length > 0) {
    badge.textContent = diagnostics.length;
  } else {
    badge.textContent = "0";
    badge.classList.add("clean");
  }
})();

// ── Tab switching ──
let activeTab = "summary";
let diagnosisRendered = false;
let summaryRendered = false;
let labRendered = false;
let schemaRendered = false;
let endpointsRendered = false;
let modulesRendered = false;

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = {
  modules: document.getElementById("tab-modules"),
  diagnosis: document.getElementById("tab-diagnosis"),
  summary: document.getElementById("tab-summary"),
  lab: document.getElementById("tab-lab"),
  schema: document.getElementById("tab-schema"),
  endpoints: document.getElementById("tab-endpoints"),
};

function switchTab(name) {
  activeTab = name;
  for (const btn of tabBtns) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
  for (const [k, el] of Object.entries(tabContents)) {
    el.classList.toggle("active", k === name);
  }

  if (name !== "modules") {
    document.getElementById("detail").style.display = "none";
    document.getElementById("mg-sidebar").classList.remove("mg-detail-open");
    mgSelected = null;
    mgFocusSet = null;
    mgCycleFocus = null;
    mgSyncTraceDrawer(null);
  }

  if (name === "diagnosis" && !diagnosisRendered) { renderDiagnosis(); diagnosisRendered = true; }
  if (name === "summary" && !summaryRendered) { renderSummary(); summaryRendered = true; }
  if (name === "lab" && !labRendered) { renderLab(); labRendered = true; }
  if (name === "schema" && !schemaRendered) { renderSchema(); schemaRendered = true; }
  if (name === "endpoints" && !endpointsRendered) { renderEndpoints(); endpointsRendered = true; }
  if (name === "modules") {
    if (modulesRendered) { mgResize(); } else { renderModules(); modulesRendered = true; }
  }
  if (name === "endpoints" && endpointsRendered) epResize();
}

for (const btn of tabBtns) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

// ── Project colors and filter setup ──
const PROJECT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const projectColorMap = {};
const isMonorepoGraph = graph.projects.length > 0;
let activeProject = "all";

if (isMonorepoGraph) {
  for (let i = 0; i < graph.projects.length; i++) {
    projectColorMap[graph.projects[i]] = PROJECT_COLORS[i % PROJECT_COLORS.length];
  }
}

function getDisplayName(n) {
  if (n.project && n.name.indexOf(n.project + "/") === 0) {
    return n.name.slice(n.project.length + 1);
  }
  return n.name;
}

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
var MG_FONT = '-apple-system, BlinkMacSystemFont, sans-serif';

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
  mgCtx.font = "bold 12px " + MG_FONT;
  var lw = mgCtx.measureText(label).width;
  mgCtx.font = "10px " + MG_FONT;
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
function mgRoundRect(x, y, w, h, r) {
  mgCtx.beginPath();
  mgCtx.moveTo(x + r, y);
  mgCtx.lineTo(x + w - r, y);
  mgCtx.quadraticCurveTo(x + w, y, x + w, y + r);
  mgCtx.lineTo(x + w, y + h - r);
  mgCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  mgCtx.lineTo(x + r, y + h);
  mgCtx.quadraticCurveTo(x, y + h, x, y + h - r);
  mgCtx.lineTo(x, y + r);
  mgCtx.quadraticCurveTo(x, y, x + r, y);
  mgCtx.closePath();
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
    mgRoundRect(c.x, c.y, c.w, c.h, 10);
    mgCtx.fillStyle = "rgba(255,255,255,0.022)";
    mgCtx.fill();
    mgCtx.strokeStyle = color;
    mgCtx.lineWidth = 1;
    mgCtx.setLineDash([]);
    mgCtx.stroke();
    if (c.key) {
      mgCtx.globalAlpha = mgClusterAlpha(c);
      mgCtx.fillStyle = color;
      mgCtx.font = "bold 12px " + MG_FONT;
      mgCtx.textAlign = "left";
      mgCtx.textBaseline = "middle";
      mgCtx.fillText(c.key, c.x + 12, c.y + 15);
      mgCtx.fillStyle = "#666";
      mgCtx.font = "10px " + MG_FONT;
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

  mgCtx.font = "9px " + MG_FONT;
  mgCtx.textAlign = "center";
  mgCtx.textBaseline = "middle";
  for (var j = 0; j < labels.length; j++) {
    var l = labels[j];
    var w = mgCtx.measureText(l.text).width + 8;
    mgCtx.globalAlpha = l.alpha;
    mgRoundRect(l.x - w / 2, l.y - 7, w, 14, 3);
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
      mgRoundRect(x - 4, y - 4, n.w + 8, n.h + 8, 10);
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

    mgRoundRect(x, y, n.w, n.h, 6);
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
    mgCtx.font = "bold 12px " + MG_FONT;
    mgCtx.fillText(n.label, n.x, n.y - 6);
    mgCtx.fillStyle = "#888";
    mgCtx.font = "10px " + MG_FONT;
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
    mgZoom = Math.min(5, mgZoom * 1.2);
    mgScheduleRedraw();
  });
  document.getElementById("mg-zoom-out").addEventListener("click", function() {
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
    document.getElementById("tab-modules").classList.add("mg-sidebar-collapsed");
    mgResize();
  });
  document.getElementById("mg-sidebar-show").addEventListener("click", function() {
    document.getElementById("tab-modules").classList.remove("mg-sidebar-collapsed");
    mgResize();
  });
  document.getElementById("mg-expand-all").addEventListener("click", function() { mgSetAllTree(true); });
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
      var html = "";
      for (var i = 0; i < node.deps.length; i++) {
        html += mgTraceRowHtml(node.deps[i], depth, path + "/" + node.deps[i]);
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
    html += '<div class="st-row mg-tree-project" data-project="' + mgEsc(pname) + '">' +
      '<span class="st-toggle" data-toggle="mgp-' + j + '">\\u25B8</span>' +
      '<span class="st-icon">' + MG_PROJECT_ICON + '</span>' +
      '<span class="st-label"><span class="st-entity-name">' + mgEsc(pname) + '</span></span>' +
      '<span class="st-count">' + mods.length + '</span></div>';
    html += '<div class="st-children" id="mgp-' + j + '">';
    for (var k = 0; k < mods.length; k++) {
      var n = mods[k];
      html += '<div class="st-row mg-tree-module" data-module="' + mgEsc(n.name) + '">' +
        '<span class="st-indent"></span><span class="st-indent"></span>' +
        '<span class="st-label">' + mgEsc(getDisplayName(n)) + '</span>' +
        (circularModules.has(n.name) ? '<span class="st-count" style="color:var(--nest-red)">cycle</span>' : "") +
        '</div>';
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
    if (node) { mgShowDetail(node); mgFlyToNode(node); mgScheduleRedraw(); }
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
    if (node) { mgShowDetail(node); mgFlyToNode(node); mgScheduleRedraw(); }
  });
}

function renderModules() {
  mgCanvas = document.getElementById("graph");
  mgCtx = mgCanvas.getContext("2d");
  mgBuild();
  mgBuildTree();
  mgBuildProblems();
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
  var attrs = tip ? ' class="has-tip tip-wide" data-tip="' + mgEsc(tip) + '"' : "";
  var info = tip ? ' <span class="md-info">' + MG_INFO_ICON + '</span>' : "";
  return '<h4' + attrs + '>' + mgEsc(title) + (count === undefined ? "" : " (" + count + ")") + info + '</h4>';
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
          '<span class="md-badge md-token">token</span>' +
          (row.strategy && row.target
            ? '<span class="md-badge md-use">' + mgEsc(row.strategy) + ' \\u2192 ' + mgEsc(row.target) + '</span>'
            : "") +
          '</div>';
        continue;
      }
      var info = byName[row.name];
      html += '<div class="md-row">' + mgNameHtml(row.name, MG_GROUP_KIND[order[g]] || "");
      if (info && info.scope) {
        html += '<span class="md-badge md-scope">' + mgEsc(info.scope) + '</span>';
      }
      if (mgUnusedProviders[row.name]) {
        html += '<span class="md-badge md-unused" title="performance/no-unused-providers: never injected and not framework-activated">unused?</span>';
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
  return '<span class="md-badge" style="color:rgb(' + rgb + ');background:rgba(' + rgb + ',0.12)">' +
    mgEsc(type) + '</span>';
}

function mgTraceBarHtml(initTime, deps, type, reused) {
  var frac = Math.max(0, Math.min(1, initTime / mgTraceMax));
  var width = (frac * 100).toFixed(2);
  if (reused) {
    return '<span class="mg-trace-track">' +
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
  return '<span class="mg-trace-track">' +
    '<span class="mg-trace-bar" style="width:' + width + '%;background:rgba(' + mgTraceColor(type) + ',0.4)"></span>' +
    (selfFrac > 0.002 ? '<span class="mg-trace-self" style="left:' + ((frac - selfFrac) * 100).toFixed(2) + '%;width:' + (selfFrac * 100).toFixed(2) + '%"></span>' : '') +
    '</span>';
}

function mgTraceRowHtml(id, depth, path) {
  var node = mgTraceNode(id);
  if (!node) return "";
  var ancestors = path.split("/");
  ancestors.pop();
  var cyc = ancestors.indexOf(id) >= 0;
  var expandable = !cyc && depth < 20 && node.deps.length > 0;
  // Slower than its consumer means the dep already existed when the consumer loaded.
  var parent = ancestors.length > 0 ? mgTraceNode(ancestors[ancestors.length - 1]) : null;
  var reused = parent !== null && node.initTime > parent.initTime;
  return '<div class="mg-trace-row' + (expandable ? ' mg-trace-expandable' : '') +
    (reused ? ' mg-trace-reused' : '') + '"' +
    ' data-trace="' + mgEsc(id) + '" data-path="' + mgEsc(path) + '" data-depth="' + depth + '">' +
    '<span class="mg-trace-label" style="padding-left:' + (Math.min(depth, 8) * 16) + 'px">' +
    '<span class="mg-trace-caret">' + (expandable ? "\\u25B8" : "") + '</span>' +
    '<span class="mg-trace-name">' + mgEsc(node.name) + '</span>' +
    mgTraceBadgeHtml(node.type) +
    (reused ? '<span class="mg-trace-reused-tag" title="Already built when this parent loaded \\u2014 its cost is counted at its first consumer">reused</span>' : '') +
    (cyc ? '<span class="mg-trace-cycle" title="circular dependency">\\u21BB</span>' : '') +
    '</span>' +
    mgTraceBarHtml(node.initTime, node.deps, node.type, reused) +
    '<span class="mg-trace-time">' + mgEsc(mgFormatMs(node.initTime)) + '</span>' +
    '</div>';
}

function mgShowModuleTrace(n) {
  var list = n.initTimings;
  mgTraceMax = list[0].initTime > 0 ? list[0].initTime : 1;
  var html = "";
  // The parser writes every timed class into the trace, so rows never miss it.
  for (var i = 0; i < list.length; i++) {
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
         : "Select a module to see its bootstrap timings.") +
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
        (rows[k].kind === "module" ? '<span class="md-badge md-module">module</span>' : "") +
        '</div>';
    }
    html += '</div>';
  }
  return html;
}

function mgCyclesHtml(n) {
  if (!circularModules.has(n.name)) return "";
  var html = '<h4 style="color:#ea2845">Circular dependencies</h4>';
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
  if (n.project) badges += '<span class="md-badge md-project">' + mgEsc(n.project) + '</span>';
  if (n.isGlobal) badges += '<span class="md-badge md-global">global</span>';
  if (circularModules.has(n.name)) badges += '<span class="md-badge md-cycle">in cycle</span>';
  if (rootModules.has(n.name)) badges += '<span class="md-badge md-root">root</span>';
  if (graph.timingsAvailable && n.initTimings && n.initTimings.length > 0) {
    badges += '<span class="md-badge md-use" id="detail-timings-btn" title="Open the bootstrap timings drawer">' +
      mgEsc(mgFormatMs(n.initTimings[0].initTime)) + ' \\u00b7 trace \\u25BE</span>';
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
      var external = !target;
      html += '<li class="md-import-row' + (external ? " md-import-ext" : "") + '" data-import="' + mgEsc(n.imports[j]) + '"><span class="md-kind-module">' + mgEsc(label) + '</span>' +
        (method ? '<span class="md-badge md-scope has-tip tip-wide badge-tip" style="margin-left:5px" data-tip="' + mgEsc(methodTip) + '">' + mgEsc(method) + '</span>' : "") +
        (external ? '<span class="md-badge md-ext has-tip tip-wide badge-tip" style="margin-left:5px" data-tip="Not declared in this codebase \\u2014 it comes from a package, e.g. @nestjs/config">external</span>' : "") +
        (target && target.project && target.project !== n.project
          ? '<span class="md-badge md-project" style="margin-left:5px">' + mgEsc(target.project) + '</span>'
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


// ── Diagnosis Tab rendering ──
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
const CAT_META = {
  security:     { label: "Security",     color: "var(--cat-security)" },
  correctness:  { label: "Correctness",  color: "var(--cat-correctness)" },
  schema:       { label: "Schema",       color: "var(--cat-schema)" },
  architecture: { label: "Architecture", color: "var(--cat-architecture)" },
  performance:  { label: "Performance",  color: "var(--cat-performance)" },
};
const CAT_ORDER = ["security", "correctness", "schema", "architecture", "performance"];

function renderDiagnosis() {
  const sidebarEl = document.getElementById("diagnosis-sidebar");
  const mainEl = document.getElementById("diagnosis-main");

  if (diagnostics.length === 0) {
    sidebarEl.style.display = "none";
    mainEl.style.left = "0";
    mainEl.innerHTML =
      '<div class="diagnosis-clean">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--score-green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
      '<p>No issues found</p>' +
      '<span>Your project passed all checks.</span>' +
      '</div>';
    return;
  }

  // Group diagnostics by file path
  const fileMap = {};
  for (let i = 0; i < diagnostics.length; i++) {
    const d = diagnostics[i];
    const fp = d.filePath || "";
    if (!fileMap[fp]) fileMap[fp] = [];
    fileMap[fp].push({ d: d, origIdx: i });
  }
  for (const fp in fileMap) {
    fileMap[fp].sort(function(a, b) { return (a.d.line || 0) - (b.d.line || 0); });
  }

  // Build tree from file paths
  const diagSev = function(item) { return item.d.severity; };
  const treeRoot = buildFileTree(fileMap, "diags");
  compressTree(treeRoot);

  function collectSevs(diagList) {
    const sevs = {};
    for (let i = 0; i < diagList.length; i++) sevs[diagList[i].d.severity] = true;
    return Object.keys(sevs).join(",");
  }

  const ruleListEl = document.getElementById("diagnosis-rule-list");
  ruleListEl.innerHTML = renderTreeHtml(treeRoot, {
    itemsKey: "diags",
    getSeverity: diagSev,
    collectSevs: collectSevs,
  });

  // Expand state per diagnostic origIdx
  const expandState = {};
  const EXPAND_STEP = 20;
  let activeFilePath = null;
  let activeFileEl = null;

  // Show all diagnostics for a file in the main panel
  function showFile(filePath) {
    const diags = fileMap[filePath];
    if (!diags) return;

    // Filter by active severity and scope
    let filtered = diags.filter(function(entry) { return isDiagVisible(entry); });

    // Update active state in sidebar
    if (activeFileEl) activeFileEl.classList.remove("active");
    const fileEls = ruleListEl.querySelectorAll(".tree-file");
    for (let i = 0; i < fileEls.length; i++) {
      if (fileEls[i].dataset.path === filePath) {
        fileEls[i].classList.add("active");
        activeFileEl = fileEls[i];
        break;
      }
    }
    activeFilePath = filePath;

    const emptyState = document.getElementById("diagnosis-empty-state");
    const fileView = document.getElementById("diagnosis-file-view");
    emptyState.style.display = "none";
    fileView.style.display = "block";

    // File header
    const headerEl = document.getElementById("diagnosis-file-header");
    headerEl.innerHTML = renderFileHeader(filePath, filtered, diagSev);

    // ── Unified code viewer ──
    const codeEl = document.getElementById("diagnosis-file-code");
    codeEl.innerHTML = "";

    const fullSource = fileSources[filePath];

    // Sort filtered diagnostics by line number
    const sorted = filtered.slice().sort(function(a, b) { return (a.d.line || 0) - (b.d.line || 0); });

    // Check if any diagnostic has source lines
    let hasAnySource = false;
    for (let si = 0; si < sorted.length; si++) {
      const sl = sourceLinesData[sorted[si].origIdx];
      if (sl && sl.length > 0) { hasAnySource = true; break; }
    }

    if (!hasAnySource && !fullSource) {
      codeEl.innerHTML = isMonorepo
        ? '<div class="no-source-msg">Source code viewer is not available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package for the full code viewer.</span></div>'
        : '<div class="no-source-msg">Source code not available for project-scoped rules</div>';
    } else if (fullSource) {
      const allLines = fullSource.split("\\n");
      const totalLines = allLines.length;

      // Build segments from diagnostic source ranges
      const segments = [];
      for (let si = 0; si < sorted.length; si++) {
        const entry = sorted[si];
        // Schema diagnostics have no line — skip code segment
        if (!("line" in entry.d)) continue;
        const sl = sourceLinesData[entry.origIdx];
        let segStart, segEnd;
        if (sl && sl.length > 0) {
          segStart = sl[0].line;
          segEnd = sl[sl.length - 1].line;
        } else {
          segStart = Math.max(1, entry.d.line - 3);
          segEnd = Math.min(totalLines, entry.d.line + 3);
        }
        // Apply expand state
        if (!expandState[entry.origIdx]) expandState[entry.origIdx] = { above: 0, below: 0 };

        // Merge with previous segment if overlapping or within 3 lines
        if (segments.length > 0) {
          const prev = segments[segments.length - 1];
          if (segStart <= prev.end + 4) {
            prev.end = Math.max(prev.end, segEnd);
            prev.diagEntries.push({ line: entry.d.line, rule: entry.d.rule, message: entry.d.message, severity: entry.d.severity });
            continue;
          }
        }
        segments.push({ start: segStart, end: segEnd, diagEntries: [{ line: entry.d.line, rule: entry.d.rule, message: entry.d.message, severity: entry.d.severity }] });
      }

      // Apply global expand state for first/last segment
      if (segments.length > 0) {
        // Use global expand state keyed by filePath
        if (!expandState["__file_" + filePath]) expandState["__file_" + filePath] = { above: 0, below: 0 };
        const fileExpand = expandState["__file_" + filePath];
        segments[0].start = Math.max(1, segments[0].start - fileExpand.above);
        segments[segments.length - 1].end = Math.min(totalLines, segments[segments.length - 1].end + fileExpand.below);
      }

      // Render expand-above row
      if (segments.length > 0 && segments[0].start > 1) {
        const aboveCount = segments[0].start - 1;
        const aboveRow = document.createElement("div");
        aboveRow.className = "code-expand-row";
        aboveRow.innerHTML = SVG_UP + " Expand " + Math.min(EXPAND_STEP, aboveCount) + " lines";
        (function(fp) {
          aboveRow.addEventListener("click", function() {
            const mEl = document.getElementById("diagnosis-main");
            const scrollBefore = mEl.scrollTop;
            expandState["__file_" + fp].above += EXPAND_STEP;
            showFile(fp);
            mEl.scrollTop = scrollBefore;
          });
        })(filePath);
        codeEl.appendChild(aboveRow);
      }

      // Render each segment with separators between them
      for (let sg = 0; sg < segments.length; sg++) {
        if (sg > 0) {
          const gapStart = segments[sg - 1].end;
          const gapEnd = segments[sg].start;
          const hiddenCount = gapEnd - gapStart - 1;
          if (hiddenCount > 0) {
            const sepRow = document.createElement("div");
            sepRow.className = "code-separator-row";
            sepRow.textContent = "\\u22EF " + hiddenCount + " line" + (hiddenCount !== 1 ? "s" : "") + " hidden";
            codeEl.appendChild(sepRow);
          }
        }

        const seg = segments[sg];
        const snippetLines = allLines.slice(seg.start - 1, seg.end);
        const codeText = snippetLines.join("\\n");
        const firstLineNum = seg.start;

        // Compute highlight lines and line metadata relative to this segment
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < seg.diagEntries.length; hi++) {
          const de = seg.diagEntries[hi];
          const relLine = de.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= snippetLines.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: de.rule, message: de.message, severity: de.severity });
          }
        }

        const wrapDiv = document.createElement("div");
        codeEl.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
            skipScrollIntoView: sg > 0,
          });
        }
      }

      // Render expand-below row
      if (segments.length > 0 && segments[segments.length - 1].end < totalLines) {
        const belowCount = totalLines - segments[segments.length - 1].end;
        const belowRow = document.createElement("div");
        belowRow.className = "code-expand-row";
        belowRow.innerHTML = SVG_DOWN + " Expand " + Math.min(EXPAND_STEP, belowCount) + " lines";
        (function(fp) {
          belowRow.addEventListener("click", function() {
            const mEl = document.getElementById("diagnosis-main");
            const scrollBefore = mEl.scrollTop;
            expandState["__file_" + fp].below += EXPAND_STEP;
            showFile(fp);
            mEl.scrollTop = scrollBefore;
          });
        })(filePath);
        codeEl.appendChild(belowRow);
      }
    } else {
      // No fullSource but has sourceLines — render from snippet data
      const firstWithSource = sorted.find(function(entry) {
        const lines = sourceLinesData[entry.origIdx];
        return lines && lines.length > 0;
      });
      const sl = firstWithSource ? sourceLinesData[firstWithSource.origIdx] : null;
      if (sl && sl.length > 0) {
        const codeText = sl.map(function(s) { return s.text; }).join("\\n");
        const firstLineNum = sl[0].line;
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < sorted.length; hi++) {
          const de = sorted[hi].d;
          if (!("line" in de)) continue;
          const relLine = de.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= sl.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: de.rule, message: de.message, severity: de.severity });
          }
        }
        const wrapDiv = document.createElement("div");
        codeEl.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
          });
        }
      }
    }

    // ── Stacked diagnostic info items below code ──
    const infoEl = document.getElementById("diagnosis-file-info");
    infoEl.innerHTML = "";

    // Group diagnostics by rule (preserving order of first occurrence)
    const ruleGroups = [];
    const ruleGroupMap = {};
    for (let j = 0; j < sorted.length; j++) {
      const entry = sorted[j];
      const rule = entry.d.rule;
      if (!ruleGroupMap[rule]) {
        ruleGroupMap[rule] = { rule: rule, entries: [] };
        ruleGroups.push(ruleGroupMap[rule]);
      }
      ruleGroupMap[rule].entries.push(entry);
    }

    for (let g = 0; g < ruleGroups.length; g++) {
      const group = ruleGroups[g];
      const item = document.createElement("div");
      item.className = "diag-info-item";

      // Render each diagnostic's header + message
      let innerHtml = "";
      let helpText = null;
      for (let k = 0; k < group.entries.length; k++) {
        const d = group.entries[k].d;
        const sevColor = d.severity === "error" ? "var(--sev-error)"
          : d.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";
        var locationLabel = ("line" in d)
          ? '<span class="diag-linecol">Ln ' + d.line + ', Col ' + d.column + '</span>'
          : (d.entity ? '<span class="diag-linecol">' + escHtml(d.entity) + (d.schemaColumn ? '.' + escHtml(d.schemaColumn) : '') + '</span>' : '');
        innerHtml +=
          '<div class="diag-info-header">' +
            '<div class="sev-dot" style="background:' + sevColor + '"></div>' +
            '<span class="code-sev-badge ' + d.severity + '">' + d.severity + '</span>' +
            '<span class="code-rule-badge">' + escHtml(d.rule) + '</span>' +
            locationLabel +
          '</div>' +
          '<div class="diag-info-msg">' + escHtml(d.message) + '</div>';
        if (!helpText && d.help) helpText = d.help;
      }
      item.innerHTML = innerHtml;

      // Help text — once per group
      if (helpText) {
        const helpDiv = document.createElement("div");
        helpDiv.className = "diag-info-help";
        helpDiv.innerHTML = '<div class="section-label">Recommendation</div>' + escHtml(helpText);
        item.appendChild(helpDiv);
      }

      // Examples — once per group
      const ex = ruleExamples[group.rule];
      if (ex) {
        const exDiv = document.createElement("div");
        exDiv.className = "diag-info-examples";
        exDiv.innerHTML =
          '<div class="section-label">Examples</div>' +
          '<div class="examples-group">' +
            '<div class="example-block bad"><div class="example-tag bad">Bad</div><div class="example-code"></div></div>' +
            '<div class="example-block good"><div class="example-tag good">Good</div><div class="example-code"></div></div>' +
          '</div>';
        if (window.createCodeViewer) {
          window.createCodeViewer(exDiv.querySelector(".example-block.bad .example-code"), ex.bad, { lineNumbers: false });
          window.createCodeViewer(exDiv.querySelector(".example-block.good .example-code"), ex.good, { lineNumbers: false });
        }
        item.appendChild(exDiv);
      }

      infoEl.appendChild(item);
    }

    // Scroll main panel to top
    mainEl.scrollTop = 0;
  }

  // Delegated click handler for tree headers
  ruleListEl.addEventListener("click", function(e) {
    const folderH = e.target.closest(".tree-folder-header");
    if (folderH) { folderH.parentElement.classList.toggle("collapsed"); return; }
    const fileH = e.target.closest(".tree-file-header");
    if (fileH) {
      const fileEl = fileH.parentElement;
      const path = fileEl.dataset.path;
      if (path) showFile(path);
    }
  });

  // Collapse-all toggle
  const collapseAllBtn = sidebarEl.querySelector(".collapse-all-btn");
  collapseAllBtn.addEventListener("click", function() {
    const folders = ruleListEl.querySelectorAll(".tree-folder");
    let someExpanded = false;
    for (let i = 0; i < folders.length; i++) {
      if (!folders[i].classList.contains("collapsed")) { someExpanded = true; break; }
    }
    for (let i = 0; i < folders.length; i++) {
      if (someExpanded) folders[i].classList.add("collapsed");
      else folders[i].classList.remove("collapsed");
    }
    collapseAllBtn.classList.toggle("all-collapsed", someExpanded);
  });

  // Severity filter
  let activeSev = "all";
  const pills = sidebarEl.querySelectorAll(".sev-pill");

  // Scope filter
  let activeScope = "all";
  const scopePills = sidebarEl.querySelectorAll(".scope-pill");

  function isDiagVisible(entry) {
    if (activeSev !== "all" && entry.d.severity !== activeSev) return false;
    if (activeScope !== "all" && entry.d.scope !== activeScope) return false;
    return true;
  }

  function countFileVisibleDiags(filePath) {
    const diags = fileMap[filePath];
    if (!diags) return 0;
    let count = 0;
    for (let i = 0; i < diags.length; i++) {
      if (isDiagVisible(diags[i])) count++;
    }
    return count;
  }

  function updateTreeVisibility() {
    // 1. File nodes — hide if 0 matching diags, update count + severity icon
    const fileNodes = ruleListEl.querySelectorAll(".tree-file");
    for (let f = 0; f < fileNodes.length; f++) {
      const fPath = fileNodes[f].dataset.path;
      const visCount = countFileVisibleDiags(fPath);
      fileNodes[f].classList.toggle("hidden", visCount === 0);
      const fc = fileNodes[f].querySelector(".tree-count");
      if (fc) fc.textContent = visCount;
      // Update severity indicator
      const fIcon = fileNodes[f].querySelector(".tree-file-icon");
      if (fIcon) {
        fIcon.classList.remove("sev-indicator-error", "sev-indicator-warning", "sev-indicator-info");
        if (visCount > 0) {
          const fDiags = fileMap[fPath];
          let fWorst = "info";
          for (let vi = 0; vi < fDiags.length; vi++) {
            if (!isDiagVisible(fDiags[vi])) continue;
            const vs = fDiags[vi].d.severity;
            if (vs === "error") { fWorst = "error"; break; }
            if (vs === "warning") fWorst = "warning";
          }
          fIcon.classList.add("sev-indicator-" + fWorst);
        }
      }
    }
    // 2. Folder nodes — process in reverse DOM order (deepest first)
    const folderNodes = ruleListEl.querySelectorAll(".tree-folder");
    for (let g = folderNodes.length - 1; g >= 0; g--) {
      const folder = folderNodes[g];
      const body = folder.querySelector(".tree-folder-body");
      const visChildren = body.querySelectorAll(":scope > .tree-file:not(.hidden), :scope > .tree-folder:not(.hidden)");
      folder.classList.toggle("hidden", visChildren.length === 0);
      // Count visible diags in all descendant files
      const descendantFiles = folder.querySelectorAll(".tree-file:not(.hidden)");
      let totalCount = 0;
      for (let df = 0; df < descendantFiles.length; df++) {
        totalCount += countFileVisibleDiags(descendantFiles[df].dataset.path);
      }
      const gc = folder.querySelector(":scope > .tree-folder-header .tree-count");
      if (gc) gc.textContent = totalCount;
      // Update severity indicator
      const gIcon = folder.querySelector(":scope > .tree-folder-header .tree-folder-icon");
      if (gIcon) {
        gIcon.classList.remove("sev-indicator-error", "sev-indicator-warning", "sev-indicator-info");
        if (totalCount > 0) {
          let gWorst = "info";
          for (let di = 0; di < descendantFiles.length; di++) {
            const dDiags = fileMap[descendantFiles[di].dataset.path];
            if (!dDiags) continue;
            for (let ai = 0; ai < dDiags.length; ai++) {
              if (!isDiagVisible(dDiags[ai])) continue;
              const as = dDiags[ai].d.severity;
              if (as === "error") { gWorst = "error"; break; }
              if (as === "warning") gWorst = "warning";
            }
            if (gWorst === "error") break;
          }
          gIcon.classList.add("sev-indicator-" + gWorst);
        }
      }
    }
    // 3. If current file is hidden, clear main panel
    if (activeFileEl && activeFileEl.classList.contains("hidden")) {
      activeFileEl.classList.remove("active");
      activeFileEl = null;
      activeFilePath = null;
      document.getElementById("diagnosis-empty-state").style.display = "flex";
      document.getElementById("diagnosis-file-view").style.display = "none";
    } else if (activeFilePath) {
      // Re-render main panel with filtered diagnostics
      showFile(activeFilePath);
    }
  }
  for (let pi = 0; pi < pills.length; pi++) {
    pills[pi].addEventListener("click", function() {
      activeSev = this.dataset.sev;
      for (let pp = 0; pp < pills.length; pp++) pills[pp].classList.toggle("active", pills[pp] === this);
      updateTreeVisibility();
    });
  }
  for (let si = 0; si < scopePills.length; si++) {
    scopePills[si].addEventListener("click", function() {
      activeScope = this.dataset.scope;
      for (let sp = 0; sp < scopePills.length; sp++) scopePills[sp].classList.toggle("active", scopePills[sp] === this);
      updateTreeVisibility();
    });
  }
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Shared SVG icons ──
const SVG_FOLDER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const SVG_FILE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const SVG_UP = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8l1.5 1.5L8 3l6.5 6.5L16 8 8 0z"/></svg>';
const SVG_DOWN = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8l1.5-1.5L8 13l6.5-6.5L16 8 8 16z"/></svg>';

// ── Shared tree helpers ──
function buildFileTree(fileMap, itemsKey) {
  const root = { name: "", children: {}, files: {} };
  for (const fp in fileMap) {
    if (fp === "") continue;
    const parts = fp.split("/");
    const fName = parts.pop();
    let node = root;
    for (let p = 0; p < parts.length; p++) {
      if (!node.children[parts[p]]) node.children[parts[p]] = { name: parts[p], children: {}, files: {} };
      node = node.children[parts[p]];
    }
    const fileNode = { name: fName, fullPath: fp };
    fileNode[itemsKey] = fileMap[fp];
    node.files[fName] = fileNode;
  }
  return root;
}

function compressTree(root) {
  function compress(n) {
    for (const k in n.children) compress(n.children[k]);
    const cKeys = Object.keys(n.children);
    const fKeys = Object.keys(n.files);
    if (cKeys.length === 1 && fKeys.length === 0) {
      const child = n.children[cKeys[0]];
      n.name = n.name ? n.name + "/" + child.name : child.name;
      n.children = child.children;
      n.files = child.files;
    }
  }
  for (const rk in root.children) compress(root.children[rk]);
}

function worstSev(itemList, getSeverity) {
  let worst = "info";
  for (let i = 0; i < itemList.length; i++) {
    const s = getSeverity(itemList[i]);
    if (s === "error") return "error";
    if (s === "warning") worst = "warning";
  }
  return worst;
}

function worstSevNode(n, itemsKey, getSeverity) {
  let worst = "info";
  for (const k in n.children) {
    const cs = worstSevNode(n.children[k], itemsKey, getSeverity);
    if (cs === "error") return "error";
    if (cs === "warning") worst = "warning";
  }
  for (const f in n.files) {
    const fs = worstSev(n.files[f][itemsKey], getSeverity);
    if (fs === "error") return "error";
    if (fs === "warning") worst = "warning";
  }
  return worst;
}

function countItems(n, itemsKey) {
  let total = 0;
  for (const k in n.children) total += countItems(n.children[k], itemsKey);
  for (const f in n.files) total += n.files[f][itemsKey].length;
  return total;
}

function renderTreeHtml(root, config) {
  let html = "";
  function renderNode(n, depth) {
    const dirs = Object.keys(n.children).sort();
    const files = Object.keys(n.files).sort();
    const pad = (depth * 12) + "px";

    for (let i = 0; i < dirs.length; i++) {
      const child = n.children[dirs[i]];
      const folderSev = worstSevNode(child, config.itemsKey, config.getSeverity);
      const folderCount = countItems(child, config.itemsKey);
      html += '<div class="tree-folder">' +
        '<div class="tree-folder-header" style="padding-left:calc(14px + ' + pad + ')">' +
        '<span class="tree-chevron">&#9660;</span>' +
        '<span class="tree-folder-icon sev-indicator-' + folderSev + '">' + SVG_FOLDER + '</span>' +
        '<span class="tree-folder-name">' + escHtml(child.name) + '</span>' +
        '<span class="tree-count">' + folderCount + '</span>' +
        '</div><div class="tree-folder-body">';
      renderNode(child, depth + 1);
      html += '</div></div>';
    }

    for (let j = 0; j < files.length; j++) {
      const fileNode = n.files[files[j]];
      const fileSev = worstSev(fileNode[config.itemsKey], config.getSeverity);
      const fileCount = fileNode[config.itemsKey].length;
      let extraAttrs = "";
      if (config.collectSevs) extraAttrs = ' data-sevs="' + config.collectSevs(fileNode[config.itemsKey]) + '"';
      html += '<div class="tree-file" data-path="' + escHtml(fileNode.fullPath) + '"' + extraAttrs + '>' +
        '<div class="tree-file-header" style="padding-left:calc(14px + ' + pad + ')">' +
        '<span class="tree-file-icon sev-indicator-' + fileSev + '">' + SVG_FILE + '</span>' +
        '<span class="tree-file-name">' + escHtml(fileNode.name) + '</span>' +
        '<span class="tree-count">' + fileCount + '</span>' +
        '</div></div>';
    }
  }
  renderNode(root, 0);
  return html;
}

function renderFileHeader(filePath, items, getSeverity) {
  const pathParts = filePath.split("/");
  const fileName = pathParts.pop();
  const parentDir = pathParts.join("/");
  const sevCounts = { error: 0, warning: 0, info: 0 };
  for (let c = 0; c < items.length; c++) sevCounts[getSeverity(items[c])]++;
  let countsHtml = "";
  if (sevCounts.error > 0) countsHtml += '<span><span class="fv-count-dot" style="background:var(--sev-error)"></span>' + sevCounts.error + ' error' + (sevCounts.error !== 1 ? 's' : '') + '</span>';
  if (sevCounts.warning > 0) countsHtml += '<span><span class="fv-count-dot" style="background:var(--sev-warning)"></span>' + sevCounts.warning + ' warning' + (sevCounts.warning !== 1 ? 's' : '') + '</span>';
  if (sevCounts.info > 0) countsHtml += '<span><span class="fv-count-dot" style="background:var(--sev-info)"></span>' + sevCounts.info + ' info</span>';
  return '<div class="file-view-title">' + escHtml(fileName) + '</div>' +
    (parentDir ? '<div class="file-view-dir">' + escHtml(parentDir) + '/</div>' : '') +
    '<div class="file-view-counts">' + countsHtml + '</div>';
}

// ── Summary Tab rendering ──
function renderSummary() {
  const container = document.getElementById("tab-summary");
  const sv = project.score.value;
  const stars = Math.round(sv / 20);

  let html = '<div class="summary-grid">';

  // Score card (full width)
  html += '<div class="ov-card full-width"><h3>Health Score</h3>' +
    '<div class="ov-score-row">' +
    '<div class="ov-score-ring">' + makeScoreRingSvg(120, 8, sv) + '</div>' +
    '<div class="ov-score-details">' +
    '<div class="ov-score-label">' + sv + ' / 100</div>' +
    '<div class="ov-score-sublabel">' + escHtml(project.score.label) + '</div>' +
    '<div class="ov-stars">' + "\\u2605".repeat(stars) + "\\u2606".repeat(5 - stars) + '</div>' +
    '<div class="ov-breakdown">' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-error)"></div> ' + summary.errors + ' errors</div>' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-warning)"></div> ' + summary.warnings + ' warnings</div>' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-info)"></div> ' + summary.info + ' info</div>' +
    '</div></div></div></div>';

  // Project info card
  html += '<div class="ov-card"><h3>Project Info</h3><div class="ov-info-grid">' +
    '<div class="ov-info-item"><label>Name</label><span>' + escHtml(project.name) + '</span></div>' +
    '<div class="ov-info-item"><label>NestJS</label><span>' + (project.nestVersion || "—") + '</span></div>' +
    '<div class="ov-info-item"><label>Framework</label><span>' + (project.framework || "—") + '</span></div>' +
    '<div class="ov-info-item"><label>ORM</label><span>' + (project.orm || "—") + '</span></div>' +
    '<div class="ov-info-item"><label>Files</label><span>' + project.fileCount + '</span></div>' +
    '<div class="ov-info-item"><label>Modules</label><span>' + project.moduleCount + '</span></div>' +
    '</div></div>';

  // Category breakdown card
  html += '<div class="ov-card"><h3>Issues by Category</h3>';
  for (const cat of CAT_ORDER) {
    const m = CAT_META[cat];
    const count = (summary.byCategory && summary.byCategory[cat]) || 0;
    html += '<div class="ov-cat-row">' +
      '<div class="ov-cat-icon" style="background:' + m.color + '"></div>' +
      '<span class="ov-cat-name">' + m.label + '</span>' +
      '<span class="ov-cat-count">' + count + '</span></div>';
  }
  html += '</div>';

  // Module graph stats card
  html += '<div class="ov-card"><h3>Module Graph</h3>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Total modules</span><span class="ov-stat-value">' + graph.modules.length + '</span></div>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Root modules</span><span class="ov-stat-value">' + rootModules.size + '</span></div>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Edges</span><span class="ov-stat-value">' + graph.edges.length + '</span></div>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Circular deps</span><span class="ov-stat-value">' + graph.circularDeps.length + '</span></div>' +
    '</div>';

  // Analysis card
  html += '<div class="ov-card"><h3>Analysis</h3>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Duration</span><span class="ov-stat-value">' + (elapsedMs / 1000).toFixed(2) + 's</span></div>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Files scanned</span><span class="ov-stat-value">' + project.fileCount + '</span></div>' +
    '<div class="ov-stat-row"><span class="ov-stat-label">Total issues</span><span class="ov-stat-value">' + summary.total + '</span></div>' +
    '</div>';

  html += '</div>';
  container.innerHTML = html;
}

// ── Lab Tab rendering ──
function renderLab() {
  const PLAYGROUND_PRESETS = {
    "todo": {
      ruleId: "no-todo-comments",
      category: "correctness",
      severity: "warning",
      scope: "file",
      description: "Flags TODO comments left in source code",
      code: '// Find TODO/FIXME comments...\\nconst lines = context.fileText.split("\\\\n");\\nfor (let i = 0; i < lines.length; i++) {\\n  if (/\\\\/\\\\/\\\\s*(TODO|FIXME)/.test(lines[i])) {\\n    context.report({\\n      message: "Found TODO/FIXME comment: " + lines[i].trim(),\\n      line: i + 1,\\n    });\\n  }\\n}'
    },
    "console-log": {
      ruleId: "no-console-log",
      category: "correctness",
      severity: "warning",
      scope: "file",
      description: "Flags console.log statements left in source code",
      code: '// Find console.log() calls...\\nconst lines = context.fileText.split("\\\\n");\\nfor (let i = 0; i < lines.length; i++) {\\n  if (/console\\\\.(log|debug|warn|error)\\\\s*\\\\(/.test(lines[i])) {\\n    const match = lines[i].match(/console\\\\.(log|debug|warn|error)/);\\n    context.report({\\n      message: "Found console." + match[1] + "() call",\\n      line: i + 1,\\n    });\\n  }\\n}'
    },
    "large-file": {
      ruleId: "no-large-files",
      category: "architecture",
      severity: "info",
      scope: "file",
      description: "Flags files exceeding 300 lines",
      code: '// Flag files that are too long\\nconst lines = context.fileText.split("\\\\n");\\nconst MAX_LINES = 300;\\nif (lines.length > MAX_LINES) {\\n  context.report({\\n    message: "File has " + lines.length + " lines (max " + MAX_LINES + ")",\\n    line: 1,\\n  });\\n}'
    },
    "orphan-modules": {
      ruleId: "find-orphan-modules",
      category: "architecture",
      severity: "info",
      scope: "project",
      description: "Finds modules never imported by another module",
      code: '// Find modules that are never imported...\\nvar imported = new Set();\\nfor (var i = 0; i < context.modules.length; i++) {\\n  var mod = context.modules[i];\\n  for (var j = 0; j < mod.imports.length; j++) {\\n    imported.add(mod.imports[j]);\\n  }\\n}\\nfor (var i = 0; i < context.modules.length; i++) {\\n  var mod = context.modules[i];\\n  if (mod.name !== "AppModule" && !imported.has(mod.name)) {\\n    context.report({\\n      message: "Module \\'" + mod.name + "\\' is never imported",\\n      filePath: mod.filePath,\\n      line: 1,\\n    });\\n  }\\n}'
    },
    "unused-providers": {
      ruleId: "find-unused-providers",
      category: "performance",
      severity: "warning",
      scope: "project",
      description: "Finds providers never injected anywhere",
      code: '// Find providers not used as dependencies...\\nvar allDeps = new Set();\\nfor (var i = 0; i < context.providers.length; i++) {\\n  var p = context.providers[i];\\n  for (var j = 0; j < p.dependencies.length; j++) {\\n    allDeps.add(p.dependencies[j]);\\n  }\\n}\\nfor (var i = 0; i < context.providers.length; i++) {\\n  var p = context.providers[i];\\n  if (!allDeps.has(p.name)) {\\n    context.report({\\n      message: "Provider \\'" + p.name + "\\' is never injected",\\n      filePath: p.filePath,\\n      line: 1,\\n    });\\n  }\\n}'
    },
  };

  const presetSelect = document.getElementById("pg-preset");
  function loadPreset(key) {
    const p = PLAYGROUND_PRESETS[key];
    if (!p) return;
    document.getElementById("pg-rule-id").value = p.ruleId;
    document.getElementById("pg-category").value = p.category;
    document.getElementById("pg-severity").value = p.severity;
    document.getElementById("pg-scope").value = p.scope || "file";
    document.getElementById("pg-description").value = p.description;
    updateContextHint();
    if (window.cmEditor) {
      window.cmEditor.dispatch({
        changes: { from: 0, to: window.cmEditor.state.doc.length, insert: p.code }
      });
    }
  }
  presetSelect.addEventListener("change", function() { loadPreset(this.value); });

  function updateContextHint() {
    const hint = document.getElementById("pg-context-hint");
    const scope = document.getElementById("pg-scope").value;
    if (scope === "project") {
      hint.textContent = "context.files · context.fileSources · context.modules · context.edges · context.circularDeps · context.providers · context.report({ message, filePath, line })";
    } else {
      hint.textContent = "context.fileText · context.filePath · context.report({ message, line })";
    }
  }

  document.getElementById("pg-scope").addEventListener("change", function() {
    updateContextHint();
    filterPresetsByScope();
  });

  function filterPresetsByScope() {
    const scope = document.getElementById("pg-scope").value;
    const options = presetSelect.querySelectorAll("option");
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const preset = PLAYGROUND_PRESETS[opt.value];
      if (preset) {
        opt.style.display = preset.scope === scope ? "" : "none";
      }
    }
    const optgroups = presetSelect.querySelectorAll("optgroup");
    for (let i = 0; i < optgroups.length; i++) {
      const group = optgroups[i];
      const visibleChildren = group.querySelectorAll("option");
      let hasVisible = false;
      for (let j = 0; j < visibleChildren.length; j++) {
        if (visibleChildren[j].style.display !== "none") { hasVisible = true; break; }
      }
      group.style.display = hasVisible ? "" : "none";
    }
    const currentPreset = PLAYGROUND_PRESETS[presetSelect.value];
    if (currentPreset && currentPreset.scope !== scope) {
      for (let i = 0; i < options.length; i++) {
        const preset = PLAYGROUND_PRESETS[options[i].value];
        if (preset && preset.scope === scope) {
          presetSelect.value = options[i].value;
          loadPreset(options[i].value);
          break;
        }
      }
    }
  }

  loadPreset(presetSelect.value);

  const runBtn = document.getElementById("pg-run-btn");
  const errorEl = document.getElementById("pg-error");
  const resultList = document.getElementById("pg-result-list");
  const resultCount = document.getElementById("pg-result-count");
  const resultEmpty = document.getElementById("pg-result-empty");
  const pgFileView = document.getElementById("pg-file-view");
  const pgFileHeader = document.getElementById("pg-file-header");
  const pgFileCode = document.getElementById("pg-file-code");

  let activeResultEl = null;
  let pgExpandState = {};
  const PG_EXPAND_STEP = 20;
  let currentPgFileMap = {};
  let activePgFilePath = null;

  // Delegated click handler — registered once, outside runBtn
  resultList.addEventListener("click", function(e) {
    const folderH = e.target.closest(".tree-folder-header");
    if (folderH) { folderH.parentElement.classList.toggle("collapsed"); return; }
    const fileH = e.target.closest(".tree-file-header");
    if (fileH) {
      const fileEl = fileH.parentElement;
      const path = fileEl.dataset.path;
      if (path) showPgFile(path);
      return;
    }
    const standalone = e.target.closest(".pg-standalone-item");
    if (standalone) {
      const idx = Number(standalone.dataset.idx);
      const items = currentPgFileMap[""] || [];
      const entry = items[idx];
      if (!entry) return;
      if (activeResultEl) activeResultEl.classList.remove("active");
      standalone.classList.add("active");
      activeResultEl = standalone;
      pgFileView.style.display = "none";
      return;
    }
  });


  function showPgFile(filePath) {
    const findings = currentPgFileMap[filePath];
    if (!findings) return;

    // Update active state in tree
    if (activeResultEl) activeResultEl.classList.remove("active");
    const fileEls = resultList.querySelectorAll(".tree-file");
    for (let i = 0; i < fileEls.length; i++) {
      if (fileEls[i].dataset.path === filePath) {
        fileEls[i].classList.add("active");
        activeResultEl = fileEls[i];
        break;
      }
    }
    activePgFilePath = filePath;

    // File header
    const labSev = function(item) { return item.res.severity; };
    pgFileHeader.innerHTML = renderFileHeader(filePath, findings, labSev);

    // Unified code viewer
    pgFileCode.innerHTML = "";
    const fullSource = fileSources[filePath];
    if (!fullSource) {
      pgFileCode.innerHTML = isMonorepo
        ? '<div class="no-source-msg">Source code viewer is not available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package for the full code viewer.</span></div>'
        : '<div class="no-source-msg">Source code not available</div>';
    } else {
      // Sort findings by line
      const sorted = findings.slice().sort(function(a, b) { return a.res.line - b.res.line; });
      const allLines = fullSource.split("\\n");
      const totalLines = allLines.length;

      // Build segments (merge nearby findings within 4 lines)
      const segments = [];
      for (let si = 0; si < sorted.length; si++) {
        const entry = sorted[si];
        const segStart = Math.max(1, entry.res.line - 3);
        const segEnd = Math.min(totalLines, entry.res.line + 3);
        if (segments.length > 0) {
          const prev = segments[segments.length - 1];
          if (segStart <= prev.end + 4) {
            prev.end = Math.max(prev.end, segEnd);
            prev.entries.push(entry);
            continue;
          }
        }
        segments.push({ start: segStart, end: segEnd, entries: [entry] });
      }

      // Apply expand state
      if (!pgExpandState[filePath]) pgExpandState[filePath] = { above: 0, below: 0 };
      const fileExp = pgExpandState[filePath];
      if (segments.length > 0) {
        segments[0].start = Math.max(1, segments[0].start - fileExp.above);
        segments[segments.length - 1].end = Math.min(totalLines, segments[segments.length - 1].end + fileExp.below);
      }

      // Expand above
      if (segments.length > 0 && segments[0].start > 1) {
        const aboveCount = segments[0].start - 1;
        const aboveRow = document.createElement("div");
        aboveRow.className = "code-expand-row";
        aboveRow.innerHTML = SVG_UP + " Expand " + Math.min(PG_EXPAND_STEP, aboveCount) + " lines";
        (function(fp) {
          aboveRow.addEventListener("click", function() {
            pgExpandState[fp].above += PG_EXPAND_STEP;
            showPgFile(fp);
          });
        })(filePath);
        pgFileCode.appendChild(aboveRow);
      }

      // Render segments with separators
      for (let sg = 0; sg < segments.length; sg++) {
        if (sg > 0) {
          const gapStart = segments[sg - 1].end;
          const gapEnd = segments[sg].start;
          const hiddenCount = gapEnd - gapStart - 1;
          if (hiddenCount > 0) {
            const sepRow = document.createElement("div");
            sepRow.className = "code-separator-row";
            sepRow.textContent = "\\u22EF " + hiddenCount + " line" + (hiddenCount !== 1 ? "s" : "") + " hidden";
            pgFileCode.appendChild(sepRow);
          }
        }
        const seg = segments[sg];
        const snippetLines = allLines.slice(seg.start - 1, seg.end);
        const codeText = snippetLines.join("\\n");
        const firstLineNum = seg.start;
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < seg.entries.length; hi++) {
          const e = seg.entries[hi];
          const relLine = e.res.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= snippetLines.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: e.res.ruleId, message: e.res.message, severity: e.res.severity });
          }
        }
        const wrapDiv = document.createElement("div");
        pgFileCode.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
            skipScrollIntoView: sg > 0,
          });
        }
      }

      // Expand below
      if (segments.length > 0 && segments[segments.length - 1].end < totalLines) {
        const belowCount = totalLines - segments[segments.length - 1].end;
        const belowRow = document.createElement("div");
        belowRow.className = "code-expand-row";
        belowRow.innerHTML = SVG_DOWN + " Expand " + Math.min(PG_EXPAND_STEP, belowCount) + " lines";
        (function(fp) {
          belowRow.addEventListener("click", function() {
            pgExpandState[fp].below += PG_EXPAND_STEP;
            showPgFile(fp);
          });
        })(filePath);
        pgFileCode.appendChild(belowRow);
      }
    }

    pgFileView.style.display = "block";
  }

  runBtn.addEventListener("click", function() {
    errorEl.style.display = "none";
    resultList.innerHTML = "";
    pgFileView.style.display = "none";
    activeResultEl = null;
    pgExpandState = {};

    if (!window.cmEditor) {
      errorEl.textContent = "Editor not loaded — check your internet connection.";
      errorEl.style.display = "block";
      resultCount.textContent = "";
      resultEmpty.style.display = "flex";
      return;
    }
    const userCode = window.cmEditor.state.doc.toString();
    const ruleId = document.getElementById("pg-rule-id").value || "my-rule";
    const category = document.getElementById("pg-category").value;
    const severity = document.getElementById("pg-severity").value;
    const scope = document.getElementById("pg-scope").value;

    let checkFn;
    try {
      checkFn = new Function("context", userCode);
    } catch (err) {
      errorEl.textContent = "Syntax error: " + err.message;
      errorEl.style.display = "block";
      resultCount.textContent = "";
      resultEmpty.style.display = "flex";
      return;
    }

    let results = [];

    if (scope === "project") {
      const projectResults = [];
      const projectCtx = {
        files: Object.keys(fileSources),
        fileSources: fileSources,
        modules: graph.modules,
        edges: graph.edges,
        circularDeps: graph.circularDeps,
        providers: providers,
        report: function(finding) {
          projectResults.push({
            message: finding.message || "No message",
            line: finding.line || 1,
            filePath: finding.filePath || "",
            ruleId: ruleId,
            category: category,
            severity: severity,
          });
        },
      };
      try {
        checkFn(projectCtx);
      } catch (err) {
        projectResults.push({
          message: "Runtime error: " + err.message,
          line: 1,
          filePath: "",
          ruleId: ruleId,
          category: category,
          severity: "error",
          isError: true,
        });
      }
      results = projectResults;
    } else {
      const fileEntries = Object.entries(fileSources);
      for (let fi = 0; fi < fileEntries.length; fi++) {
        const filePath = fileEntries[fi][0];
        const fileText = fileEntries[fi][1];
        const fileResults = [];
        const ctx = {
          fileText: fileText,
          filePath: filePath,
          report: function(finding) {
            fileResults.push({
              message: finding.message || "No message",
              line: finding.line || 1,
              filePath: filePath,
              ruleId: ruleId,
              category: category,
              severity: severity,
            });
          },
        };
        try {
          checkFn(ctx);
        } catch (err) {
          fileResults.push({
            message: "Runtime error: " + err.message,
            line: 1,
            filePath: filePath,
            ruleId: ruleId,
            category: category,
            severity: "error",
            isError: true,
          });
        }
        for (let r = 0; r < fileResults.length; r++) results.push(fileResults[r]);
      }
    }

    // Sort by file path then line
    results.sort(function(a, b) {
      if (a.filePath < b.filePath) return -1;
      if (a.filePath > b.filePath) return 1;
      return a.line - b.line;
    });

    resultCount.textContent = "(" + results.length + " finding" + (results.length !== 1 ? "s" : "") + ")";

    if (results.length === 0) {
      if (isMonorepo && scope === "file") {
        resultEmpty.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>No source files available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package to use the Lab with file rules.</span></p>';
      } else {
        resultEmpty.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>Write a check function and click Run</p>';
      }
      resultEmpty.style.display = "flex";
      return;
    }
    resultEmpty.style.display = "none";

    currentPgFileMap = {};

    const sevColors = { error: "var(--sev-error)", warning: "var(--sev-warning)", info: "var(--sev-info)" };
    const labSev = function(item) { return item.res.severity; };

    // Group results by filePath, keeping original index
    const standaloneItems = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.filePath) { standaloneItems.push({ res: r, idx: i }); continue; }
      if (!currentPgFileMap[r.filePath]) currentPgFileMap[r.filePath] = [];
      currentPgFileMap[r.filePath].push({ res: r, idx: i });
    }
    currentPgFileMap[""] = standaloneItems;

    // Build tree from file paths
    const pgTreeRoot = buildFileTree(currentPgFileMap, "findings");
    compressTree(pgTreeRoot);

    // Render tree HTML
    let pgTreeHtml = "";

    // Render standalone items (no filePath) at top
    for (let si = 0; si < standaloneItems.length; si++) {
      const st = standaloneItems[si];
      const sc = sevColors[st.res.severity] || sevColors.warning;
      pgTreeHtml += '<div class="pg-standalone-item" data-idx="' + si + '" style="padding-left:14px">' +
        '<div class="sev-dot" style="background:' + sc + '"></div>' +
        '<span class="finding-msg">' + escHtml(st.res.message) + '</span>' +
        '</div>';
    }

    pgTreeHtml += renderTreeHtml(pgTreeRoot, {
      itemsKey: "findings",
      getSeverity: labSev,
    });
    resultList.innerHTML = pgTreeHtml;

    // Auto-select first file or standalone item
    if (results.length > 0) {
      const firstFile = resultList.querySelector(".tree-file");
      if (firstFile) {
        showPgFile(firstFile.dataset.path);
      } else {
        const firstStandalone = resultList.querySelector(".pg-standalone-item");
        if (firstStandalone) {
          firstStandalone.classList.add("active");
          activeResultEl = firstStandalone;
        }
      }
    }
  });
}

// ── Schema tab visibility ──
if (schema.entities.length > 0) {
  document.getElementById("tab-btn-schema").style.display = "";
}

// ── Endpoints tab visibility ──
if (endpoints.endpoints.length > 0) {
  document.getElementById("tab-btn-endpoints").style.display = "";
}

// ── Schema: Canvas-based interactive ER diagram ──

// Row size estimation
var TYPE_BYTES = {
  "integer": 4, "int": 4, "int4": 4, "Int": 4, "serial": 4,
  "bigint": 8, "BigInt": 8, "int8": 8, "bigserial": 8,
  "smallint": 2, "int2": 2, "tinyint": 1,
  "float": 8, "double": 8, "Float": 8, "Decimal": 8, "decimal": 8,
  "real": 4, "float4": 4, "float8": 8, "numeric": 8,
  "boolean": 1, "Boolean": 1, "bool": 1,
  "varchar": 256, "String": 256, "text": 256, "char": 64, "character varying": 256,
  "uuid": 16, "UUID": 16,
  "timestamp": 8, "DateTime": 8, "Date": 8, "date": 4, "time": 8,
  "timestamptz": 8, "timestamp without time zone": 8, "timestamp with time zone": 8,
  "json": 512, "Json": 512, "jsonb": 512,
  "enum": 4, "Enum": 4,
  "bytea": 256, "Bytes": 256,
};

function estimateRowSize(entity) {
  var total = 0;
  for (var i = 0; i < entity.columns.length; i++) {
    var t = entity.columns[i].type;
    var base = t.replace(/\\(.*\\)/, "").replace(/\\[.*\\]/, "").trim();
    total += TYPE_BYTES[base] || 64;
  }
  return total;
}

function formatBytes(b) {
  if (b >= 1024) return "~" + (b / 1024).toFixed(1) + " KB";
  return "~" + b + " B";
}

// Canvas state
var sCanvas, sCtx, sDpr, sW, sH;
var sCamX = 0, sCamY = 0, sZoom = 1;
var sDragging = null, sPanning = false, sPanStart = {x: 0, y: 0};
var sDragMoved = false;
var sHoveredEntity = null, sHoveredRelation = null;
var sSelectedEntity = null;
var sNodes = [];
var sNodeMap = {};
var sEdgeRoutes = {};
var sEdgeKeys = [];
var sAllNodes = [];
var sAllNodeMap = {};
var sFocusedMode = false;
var sShowCols = null;
var sShowAllCols = false;
// When on, picking a table in the diagram drives the list beside it.
var sSyncSidebar = true;
// The fit zoom of the current layout.
var sMinZoom = 0.2;

// Schema tooltip element
var sTooltipEl = null;
var sRelBadgeEl = null;

// Dirty-flag redraw (zero CPU at idle)
var sSchemaDirty = false;
function sScheduleRedraw() {
  if (!sSchemaDirty) {
    sSchemaDirty = true;
    requestAnimationFrame(function() { sSchemaDirty = false; schemaDraw(); });
  }
}

/** Lowest zoom either control allows, low enough to fit a large diagram. */
function sZoomFloor() {
  return Math.min(sMinZoom, 0.05);
}

var sLastZoomUi = null;
/** Keeps the zoom bar in step with the camera, whatever changed it. */
function sSyncZoomUi() {
  var pct = Math.round(sZoom * 100);
  if (pct === sLastZoomUi) return;
  sLastZoomUi = pct;
  var range = document.getElementById("schema-zoom-range");
  var label = document.getElementById("schema-zoom-value");
  if (range) range.value = String(Math.max(5, Math.min(500, pct)));
  if (label) {
    label.textContent = pct + "%";
    label.setAttribute("aria-label", pct + "% \\u00b7 fit to view");
  }
}

function sScreenToWorld(sx, sy) {
  return {
    x: (sx - sW / 2) / sZoom + sW / 2 - sCamX,
    y: (sy - sH / 2) / sZoom + sH / 2 - sCamY
  };
}

function sHitTestEntity(wx, wy) {
  for (var i = sNodes.length - 1; i >= 0; i--) {
    var n = sNodes[i];
    if (wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 &&
        wy >= n.y - n.h / 2 && wy <= n.y + n.h / 2) {
      return n;
    }
  }
  return null;
}

function sGetRelatedEntities(entityName) {
  var related = new Set();
  related.add(entityName);
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === entityName) related.add(rel.toEntity);
    if (rel.toEntity === entityName) related.add(rel.fromEntity);
  }
  return related;
}

// Point-to-segment distance for polyline hit-testing
function sPointToSegmentDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  var projX = ax + t * dx;
  var projY = ay + t * dy;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function sHitTestRelation(wx, wy) {
  var threshold = 8 / sZoom;
  for (var k = 0; k < sEdgeKeys.length; k++) {
    var key = sEdgeKeys[k];
    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;
    for (var p = 0; p < points.length - 1; p++) {
      var d = sPointToSegmentDist(wx, wy, points[p].x, points[p].y, points[p + 1].x, points[p + 1].y);
      if (d < threshold) {
        var parts = key.split("|");
        for (var r = 0; r < schema.relations.length; r++) {
          var rel = schema.relations[r];
          if (rel.fromEntity === parts[0] && rel.toEntity === parts[1]) return rel;
          if (rel.fromEntity === parts[1] && rel.toEntity === parts[0]) return rel;
        }
      }
    }
  }
  return null;
}

function sRelLabel(type) {
  if (type === "one-to-one") return "1:1";
  if (type === "one-to-many") return "1:N";
  if (type === "many-to-one") return "N:1";
  return "N:M";
}

// Manhattan edge routing
var S_EDGE_MARGIN = 14;

function sEdgeKey(fromName, toName) {
  return fromName < toName ? fromName + "|" + toName : toName + "|" + fromName;
}

function sSegmentHitsBox(ax, ay, bx, by, box, margin) {
  var left = box.x - box.w / 2 - margin;
  var right = box.x + box.w / 2 + margin;
  var top = box.y - box.h / 2 - margin;
  var bottom = box.y + box.h / 2 + margin;

  // Horizontal segment
  if (Math.abs(ay - by) < 1) {
    if (ay < top || ay > bottom) return false;
    var minX = Math.min(ax, bx);
    var maxX = Math.max(ax, bx);
    return maxX > left && minX < right;
  }
  // Vertical segment
  if (Math.abs(ax - bx) < 1) {
    if (ax < left || ax > right) return false;
    var minY = Math.min(ay, by);
    var maxY = Math.max(ay, by);
    return maxY > top && minY < bottom;
  }
  return false;
}

function sSegmentHitsAnyBox(ax, ay, bx, by, excludeA, excludeB) {
  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    if (n.name === excludeA || n.name === excludeB) continue;
    if (sSegmentHitsBox(ax, ay, bx, by, n, S_EDGE_MARGIN)) return true;
  }
  return false;
}

function sComputePort(from, to) {
  var dx = to.x - from.x;
  var dy = to.y - from.y;
  var px, py, dir;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) { px = from.x + from.w / 2; py = from.y; dir = "right"; }
    else { px = from.x - from.w / 2; py = from.y; dir = "left"; }
  } else {
    if (dy >= 0) { px = from.x; py = from.y + from.h / 2; dir = "down"; }
    else { px = from.x; py = from.y - from.h / 2; dir = "up"; }
  }
  return { x: px, y: py, dir: dir };
}

function sStepOut(port) {
  if (port.dir === "right") return { x: port.x + S_EDGE_MARGIN, y: port.y };
  if (port.dir === "left") return { x: port.x - S_EDGE_MARGIN, y: port.y };
  if (port.dir === "down") return { x: port.x, y: port.y + S_EDGE_MARGIN };
  return { x: port.x, y: port.y - S_EDGE_MARGIN };
}

function sRouteManhattan(fromNode, toNode) {
  var portA = sComputePort(fromNode, toNode);
  var portB = sComputePort(toNode, fromNode);
  var stepA = sStepOut(portA);
  var stepB = sStepOut(portB);

  var fromName = fromNode.name;
  var toName = toNode.name;

  // Try L-shape: H then V
  var midX1 = stepB.x, midY1 = stepA.y;
  if (!sSegmentHitsAnyBox(stepA.x, stepA.y, midX1, midY1, fromName, toName) &&
      !sSegmentHitsAnyBox(midX1, midY1, stepB.x, stepB.y, fromName, toName)) {
    return sSimplifyPath([portA, stepA, {x: midX1, y: midY1}, stepB, portB]);
  }

  // Try L-shape: V then H
  var midX2 = stepA.x, midY2 = stepB.y;
  if (!sSegmentHitsAnyBox(stepA.x, stepA.y, midX2, midY2, fromName, toName) &&
      !sSegmentHitsAnyBox(midX2, midY2, stepB.x, stepB.y, fromName, toName)) {
    return sSimplifyPath([portA, stepA, {x: midX2, y: midY2}, stepB, portB]);
  }

  // U-shaped detour: find best detour direction
  var bestPath = null;
  var bestLen = Infinity;
  var offsets = [
    { dx: 0, dy: -80 },
    { dx: 0, dy: 80 },
    { dx: -80, dy: 0 },
    { dx: 80, dy: 0 }
  ];
  for (var o = 0; o < offsets.length; o++) {
    var midAx = stepA.x + offsets[o].dx;
    var midAy = stepA.y + offsets[o].dy;
    var midBx = stepB.x + offsets[o].dx;
    var midBy = stepB.y + offsets[o].dy;
    var path = [portA, stepA, {x: midAx, y: midAy}, {x: midBx, y: midBy}, stepB, portB];
    var blocked = false;
    for (var s = 0; s < path.length - 1; s++) {
      if (sSegmentHitsAnyBox(path[s].x, path[s].y, path[s + 1].x, path[s + 1].y, fromName, toName)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      var len = 0;
      for (var s = 0; s < path.length - 1; s++) {
        len += Math.abs(path[s + 1].x - path[s].x) + Math.abs(path[s + 1].y - path[s].y);
      }
      if (len < bestLen) { bestLen = len; bestPath = path; }
    }
  }

  if (bestPath) return sSimplifyPath(bestPath);

  // Fallback: direct L-shape (no obstacle avoidance)
  return sSimplifyPath([portA, stepA, {x: stepB.x, y: stepA.y}, stepB, portB]);
}

function sSimplifyPath(points) {
  if (points.length <= 2) return points;
  var result = [points[0]];
  for (var i = 1; i < points.length - 1; i++) {
    var prev = result[result.length - 1];
    var next = points[i + 1];
    var curr = points[i];
    // Skip collinear points
    var sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
    var sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
    if (!sameX && !sameY) result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
}

function sRouteAllEdges() {
  sEdgeRoutes = {};
  sEdgeKeys = [];
  var seen = {};
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = sNodeMap[rel.fromEntity];
    var b = sNodeMap[rel.toEntity];
    if (!a || !b) continue;
    if (sFocusedMode && sSelectedEntity &&
        rel.fromEntity !== sSelectedEntity && rel.toEntity !== sSelectedEntity) continue;
    var key = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (seen[key]) continue;
    seen[key] = true;
    sEdgeRoutes[key] = sRouteManhattan(a, b);
    sEdgeKeys.push(key);
  }
}

function sRerouteEdgesForNode(name) {
  for (var k = 0; k < sEdgeKeys.length; k++) {
    var key = sEdgeKeys[k];
    var parts = key.split("|");
    if (parts[0] === name || parts[1] === name) {
      var a = sNodeMap[parts[0]];
      var b = sNodeMap[parts[1]];
      if (a && b) sEdgeRoutes[key] = sRouteManhattan(a, b);
    }
  }
}

// Polyline midpoint for label placement
function sPolylineMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  var totalLen = 0;
  for (var i = 0; i < points.length - 1; i++) {
    totalLen += Math.sqrt(
      (points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
      (points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
    );
  }
  var half = totalLen / 2;
  var walked = 0;
  for (var i = 0; i < points.length - 1; i++) {
    var segLen = Math.sqrt(
      (points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
      (points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
    );
    if (walked + segLen >= half) {
      var t = segLen > 0 ? (half - walked) / segLen : 0;
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y)
      };
    }
    walked += segLen;
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

/** Groups nodes into connected components using the relation edges. */
function sComputeComponents(nodes) {
  var index = {};
  var parent = [];
  for (var i = 0; i < nodes.length; i++) {
    index[nodes[i].name] = i;
    parent.push(i);
  }
  function find(a) {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = index[rel.fromEntity];
    var b = index[rel.toEntity];
    if (a === undefined || b === undefined) continue;
    var ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  var groups = {};
  for (var i = 0; i < nodes.length; i++) {
    var root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(nodes[i]);
  }
  var out = [];
  for (var key in groups) {
    if (Object.prototype.hasOwnProperty.call(groups, key)) out.push(groups[key]);
  }
  return out;
}

/** Positions one component from its own origin, with dagre or a grid. */
function sLayoutComponent(nodes) {
  var i;
  if (nodes.length === 1 || typeof dagre === "undefined") {
    var cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    var cellW = 0, cellH = 0;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].w > cellW) cellW = nodes[i].w;
      if (nodes[i].h > cellH) cellH = nodes[i].h;
    }
    var rows = Math.ceil(nodes.length / cols);
    for (i = 0; i < nodes.length; i++) {
      nodes[i].x = (i % cols) * (cellW + 60) + cellW / 2;
      nodes[i].y = Math.floor(i / cols) * (cellH + 60) + cellH / 2;
    }
    return {
      w: cols * cellW + (cols - 1) * 60,
      h: rows * cellH + (rows - 1) * 60
    };
  }

  var g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(function() { return {}; });

  var present = {};
  for (i = 0; i < nodes.length; i++) {
    present[nodes[i].name] = true;
    g.setNode(nodes[i].name, { width: nodes[i].w, height: nodes[i].h });
  }

  var seenEdge = {};
  for (i = 0; i < schema.relations.length; i++) {
    var edge = schema.relations[i];
    if (edge.fromEntity === edge.toEntity) continue;
    if (!present[edge.fromEntity] || !present[edge.toEntity]) continue;
    var ek = sEdgeKey(edge.fromEntity, edge.toEntity);
    if (seenEdge[ek]) continue;
    seenEdge[ek] = true;
    g.setEdge(edge.fromEntity, edge.toEntity);
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
  if (minX === Infinity) return { w: 0, h: 0 };
  for (i = 0; i < nodes.length; i++) {
    nodes[i].x -= minX;
    nodes[i].y -= minY;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Packs unrelated tables into a compact grid instead of one long rank. */
function sLayoutIsolatedBlock(nodes, gutter) {
  var cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  var cellW = 0, cellH = 0;
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].w > cellW) cellW = nodes[i].w;
    if (nodes[i].h > cellH) cellH = nodes[i].h;
  }
  var rows = Math.ceil(nodes.length / cols);
  for (var j = 0; j < nodes.length; j++) {
    nodes[j].x = (j % cols) * (cellW + gutter) + cellW / 2;
    nodes[j].y = Math.floor(j / cols) * (cellH + gutter) + cellH / 2;
  }
  return {
    w: cols * cellW + (cols - 1) * gutter,
    h: rows * cellH + (rows - 1) * gutter
  };
}

/** Shelf-packs component boxes into a roughly square area. */
function sPackBoxes(boxes, targetW, gutter) {
  var x = 0, y = 0, shelfH = 0;
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    if (x > 0 && x + box.w > targetW) {
      x = 0;
      y += shelfH + gutter;
      shelfH = 0;
    }
    box.ox = x;
    box.oy = y;
    x += box.w + gutter;
    if (box.h > shelfH) shelfH = box.h;
  }
}

function sComputeOverviewLayout() {
  var GUTTER = 80;
  var components = sComputeComponents(sNodes);
  var boxes = [];
  var isolated = [];
  var i;

  for (i = 0; i < components.length; i++) {
    if (components[i].length === 1) {
      isolated.push(components[i][0]);
      continue;
    }
    var size = sLayoutComponent(components[i]);
    boxes.push({ nodes: components[i], w: size.w, h: size.h });
  }

  boxes.sort(function(a, b) { return b.h - a.h || b.w - a.w; });

  if (isolated.length > 0) {
    var isoSize = sLayoutIsolatedBlock(isolated, 28);
    boxes.push({ nodes: isolated, w: isoSize.w, h: isoSize.h });
  }

  var area = 0;
  for (i = 0; i < boxes.length; i++) area += boxes[i].w * boxes[i].h;
  var targetW = Math.max(900, Math.sqrt(area) * 1.6);
  sPackBoxes(boxes, targetW, GUTTER);

  for (i = 0; i < boxes.length; i++) {
    var placed = boxes[i];
    for (var j = 0; j < placed.nodes.length; j++) {
      placed.nodes[j].x += placed.ox;
      placed.nodes[j].y += placed.oy;
    }
  }

  sRouteAllEdges();
}

function sComputeStarLayout(centerName) {
  var center = sNodeMap[centerName];
  if (!center) return;
  var cx = sW / 2;
  var cy = sH / 2;
  center.x = cx;
  center.y = cy;

  var neighbors = [];
  for (var i = 0; i < sNodes.length; i++) {
    if (sNodes[i].name !== centerName) neighbors.push(sNodes[i]);
  }
  if (neighbors.length === 0) return;

  var maxW = 180;
  var maxH = 52;
  for (var i = 0; i < sNodes.length; i++) {
    if (sNodes[i].w > maxW) maxW = sNodes[i].w;
    if (sNodes[i].h > maxH) maxH = sNodes[i].h;
  }

  var isLandscape = sW >= sH;

  if (neighbors.length === 1) {
    if (isLandscape) {
      neighbors[0].x = cx + maxW + 100;
      neighbors[0].y = cy;
    } else {
      neighbors[0].x = cx;
      neighbors[0].y = cy + maxH + 80;
    }
    return;
  }

  if (neighbors.length === 2) {
    if (isLandscape) {
      var hGap = maxW + 100;
      neighbors[0].x = cx - hGap;
      neighbors[0].y = cy;
      neighbors[1].x = cx + hGap;
      neighbors[1].y = cy;
    } else {
      var vGap = maxH + 80;
      neighbors[0].x = cx;
      neighbors[0].y = cy - vGap;
      neighbors[1].x = cx;
      neighbors[1].y = cy + vGap;
    }
    return;
  }

  var rx = sW * 0.4 - maxW / 2;
  var ry = sH * 0.4 - maxH / 2;
  var minR = maxW / 2 + maxH / 2 + 40;
  if (rx < minR) rx = minR;
  if (ry < minR) ry = minR;

  var startAngle = isLandscape ? 0 : -Math.PI / 2;

  for (var i = 0; i < neighbors.length; i++) {
    var angle = startAngle + (2 * Math.PI * i) / neighbors.length;
    neighbors[i].x = cx + rx * Math.cos(angle);
    neighbors[i].y = cy + ry * Math.sin(angle);
  }
}

/** Columns drawn per table before the "+N more" line, unless all are shown. */
var S_DEFAULT_MAX_COLS = 7;

var S_PK_COLOR = "#ea2845";
var S_FK_COLOR = "#8b5cf6";
var S_IDX_COLOR = "#f59e0b";

/** Names a relation's property and that property with an Id suffix. */
function sKeyName(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sForeignKeyColumns(entity) {
  var names = Object.create(null);
  for (var i = 0; i < entity.relations.length; i++) {
    var prop = entity.relations[i].propertyName;
    if (!prop) continue;
    names[sKeyName(prop)] = true;
    names[sKeyName(prop) + "id"] = true;
  }
  return names;
}

function sColumnKind(column, foreignKeys) {
  if (column.isPrimary) return "pk";
  if (foreignKeys[sKeyName(column.name)]) return "fk";
  if (column.isUnique || column.hasIndex) return "idx";
  return null;
}

/** Draws the key, link or index glyph that marks what a column is. */
function sDrawColumnIcon(ctx, kind, cx, cy) {
  ctx.save();
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "pk") {
    ctx.strokeStyle = S_PK_COLOR;
    ctx.beginPath();
    ctx.arc(cx - 2, cy, 2.1, 0, Math.PI * 2);
    ctx.moveTo(cx + 0.1, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx + 2.4, cy);
    ctx.lineTo(cx + 2.4, cy + 1.8);
    ctx.moveTo(cx + 4, cy);
    ctx.lineTo(cx + 4, cy + 1.8);
    ctx.stroke();
  } else if (kind === "fk") {
    ctx.strokeStyle = S_FK_COLOR;
    ctx.beginPath();
    ctx.arc(cx - 2.4, cy, 2, 0, Math.PI * 2);
    ctx.moveTo(cx - 0.4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx + 2.2, cy - 1.7);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx + 2.2, cy + 1.7);
    ctx.stroke();
  } else if (kind === "idx") {
    ctx.strokeStyle = S_IDX_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 2.4);
    ctx.lineTo(cx + 4, cy - 2.4);
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 1.6, cy);
    ctx.moveTo(cx - 4, cy + 2.4);
    ctx.lineTo(cx - 0.6, cy + 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

function sVisibleColCount(node, showCols) {
  if (!showCols) return 0;
  var total = node.entity.columns.length;
  return sShowAllCols ? total : Math.min(total, S_DEFAULT_MAX_COLS);
}

function sNodeHeight(node, showCols) {
  if (!showCols) return 52;
  var visible = sVisibleColCount(node, showCols);
  var hidden = node.entity.columns.length - visible;
  return 24 + visible * 16 + (hidden > 0 ? 16 : 0) + 8;
}

/** The overview shows columns; a focused star shows them for a small set. */
function sColumnsShown(count) {
  if (sShowCols !== null) return sShowCols;
  return !sFocusedMode || count <= 5;
}

/** Single source of truth for box size, used by both layout and drawing. */
function sApplyNodeSizes(nodes) {
  var showCols = sColumnsShown(nodes.length);
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].w = 180;
    nodes[i].h = sNodeHeight(nodes[i], showCols);
  }
  return showCols;
}

/**
 * Truncation depends only on the fixed box width and font, never on zoom, so
 * every label is measured once here instead of on every frame.
 */
function sCacheNodeLabels(nodes) {
  if (!sCtx) return;
  var BOX_W = 180;
  var maxNameW = BOX_W - 20 - 8;
  var maxMetaW = BOX_W - 16;
  function clip(text, maxW) {
    if (sCtx.measureText(text).width <= maxW) return text;
    var out = text;
    while (sCtx.measureText(out).width > maxW && out.length > 3) {
      out = out.slice(0, -1);
    }
    return out + "\\u2026";
  }
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    sCtx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
    n.nameStr = clip(n.name, maxNameW);
    sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    n.metaStr = clip(n.entity.columns.length + " cols  \\u00b7  " + n.sizeLabel, maxMetaW);
    sCtx.font = "10px monospace";
    n.colTypes = [];
    for (var c = 0; c < n.entity.columns.length; c++) {
      n.colTypes.push(clip(n.entity.columns[c].type, 60));
    }
    var foreignKeys = sForeignKeyColumns(n.entity);
    sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    n.colNames = [];
    n.colKinds = [];
    for (var k = 0; k < n.entity.columns.length; k++) {
      n.colNames.push(clip(n.entity.columns[k].name, 83));
      n.colKinds.push(sColumnKind(n.entity.columns[k], foreignKeys));
    }
  }
}

function sSetVisibleSubset(entityName) {
  if (!sFocusedMode) return;

  var emptyState = document.getElementById("schema-empty-state");

  if (!entityName) {
    sNodes = [];
    sNodeMap = {};
    sEdgeRoutes = {};
    sEdgeKeys = [];
    if (emptyState) emptyState.style.display = "flex";
    sCanvas.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  sCanvas.style.display = "block";

  var related = sGetRelatedEntities(entityName);
  sNodes = [];
  sNodeMap = {};
  for (var i = 0; i < sAllNodes.length; i++) {
    if (related.has(sAllNodes[i].name)) {
      sNodes.push(sAllNodes[i]);
      sNodeMap[sAllNodes[i].name] = sAllNodes[i];
    }
  }

  sApplyNodeSizes(sNodes);

  sComputeStarLayout(entityName);
  sRouteAllEdges();
  sCenterCamera();
  sScheduleRedraw();
}

function sCenterCamera() {
  if (sNodes.length === 0) return;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  var graphW = maxX - minX;
  var graphH = maxY - minY;
  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;

  var padW = sW * 0.85;
  var padH = sH * 0.85;
  var fit = Math.min(1.5, Math.min(padW / (graphW || 1), padH / (graphH || 1)));
  // Records the fit so the controls can zoom out this far.
  sMinZoom = Math.min(0.2, fit);
  sZoom = Math.max(sMinZoom, fit);
  // Stops the fit at the zoom where 11px column text is still legible.
  var showingCols = sColumnsShown(sNodes.length);
  if (showingCols && sZoom < 0.75) {
    sZoom = 0.75;
    // Anchors the top left of the diagram instead of centring it.
    var pad = 40;
    sCamX = (pad - sW / 2) / sZoom + sW / 2 - minX;
    sCamY = (pad - sH / 2) / sZoom + sH / 2 - minY;
    return;
  }
  sCamX = sW / 2 - cx;
  sCamY = sH / 2 - cy;
}

// Round rect helper
function sRoundRect(ctx, x, y, w, h, r) {
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

// Drawing
function schemaDraw() {
  sSyncZoomUi();
  if (sNodes.length === 0) return;
  sCtx.save();
  sCtx.clearRect(0, 0, sW, sH);
  sCtx.translate(sW / 2, sH / 2);
  sCtx.scale(sZoom, sZoom);
  sCtx.translate(-sW / 2 + sCamX, -sH / 2 + sCamY);

  var selectedRelated = sSelectedEntity ? sGetRelatedEntities(sSelectedEntity) : null;
  var hovRelFrom = sHoveredRelation ? sHoveredRelation.fromEntity : null;
  var hovRelTo = sHoveredRelation ? sHoveredRelation.toEntity : null;

  // Draw relation lines as solid polylines
  var drawnEdges = {};
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = sNodeMap[rel.fromEntity];
    var b = sNodeMap[rel.toEntity];
    if (!a || !b) continue;
    if (sFocusedMode && sSelectedEntity &&
        rel.fromEntity !== sSelectedEntity && rel.toEntity !== sSelectedEntity) continue;

    var key = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (drawnEdges[key]) continue;
    drawnEdges[key] = true;

    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;

    var isHovered = (sHoveredRelation && sEdgeKey(sHoveredRelation.fromEntity, sHoveredRelation.toEntity) === key);
    var dimmed = selectedRelated && !(selectedRelated.has(rel.fromEntity) && selectedRelated.has(rel.toEntity));

    sCtx.globalAlpha = dimmed ? 0.12 : 1;

    // Draw polyline with rounded corners
    sCtx.beginPath();
    sCtx.moveTo(points[0].x, points[0].y);
    var cornerR = 3 / sZoom;
    for (var p = 1; p < points.length - 1; p++) {
      sCtx.arcTo(points[p].x, points[p].y, points[p + 1].x, points[p + 1].y, cornerR);
    }
    sCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    if (isHovered) {
      sCtx.save();
      sCtx.shadowColor = "#ffffff";
      sCtx.shadowBlur = 8;
      sCtx.strokeStyle = "#ffffff";
      sCtx.lineWidth = 2.5 / sZoom;
      sCtx.stroke();
      sCtx.restore();
    } else {
      sCtx.strokeStyle = "#555";
      sCtx.lineWidth = 1.5 / sZoom;
      sCtx.stroke();
    }

    // Cardinality label at polyline midpoint
    if (sZoom >= 0.35) {
      var mid = sPolylineMidpoint(points);
      var labelStr = sRelLabel(rel.type);
      sCtx.font = (10 / sZoom) + "px monospace";
      sCtx.textAlign = "center";
      sCtx.textBaseline = "bottom";
      sCtx.fillStyle = isHovered ? "#ffffff" : "#666";
      sCtx.fillText(labelStr, mid.x, mid.y - 4 / sZoom);
    }
  }
  sCtx.globalAlpha = 1;

  // Draw entity boxes
  var BOX_W = 180;
  var R = 6;
  var HDR_H = 24;
  var COL_ROW_H = 16;
  var showCols = sApplyNodeSizes(sNodes);

  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    var cols = n.entity.columns;
    var visibleColCount = sVisibleColCount(n, showCols);
    var hasMore = cols.length > visibleColCount;
    var BOX_H = n.h;

    var x = n.x - BOX_W / 2;
    var y = n.y - BOX_H / 2;
    var isSelected = (sSelectedEntity === n.name);
    var isHovered = (sHoveredEntity && sHoveredEntity.name === n.name);
    var isHoverConnected = (hovRelFrom === n.name || hovRelTo === n.name);
    var dimmed = selectedRelated && !selectedRelated.has(n.name);

    sCtx.globalAlpha = dimmed ? 0.15 : 1;

    // Shadow for selected
    if (isSelected) {
      sCtx.save();
      sCtx.shadowColor = "rgba(234,40,69,0.4)";
      sCtx.shadowBlur = 12;
    }

    // Body background (full box)
    sRoundRect(sCtx, x, y, BOX_W, BOX_H, R);
    sCtx.fillStyle = "#151515";
    sCtx.fill();

    // Border
    sCtx.strokeStyle = isSelected ? "#ea2845" : (isHoverConnected || isHovered) ? "#ffffff" : "rgba(255,255,255,0.06)";
    sCtx.lineWidth = (isSelected || isHoverConnected || isHovered) ? 2 : 1;
    sCtx.stroke();

    if (isSelected) sCtx.restore();

    // Header background (top portion, clipped to rounded top)
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(x + R, y);
    sCtx.lineTo(x + BOX_W - R, y);
    sCtx.quadraticCurveTo(x + BOX_W, y, x + BOX_W, y + R);
    sCtx.lineTo(x + BOX_W, y + HDR_H);
    sCtx.lineTo(x, y + HDR_H);
    sCtx.lineTo(x, y + R);
    sCtx.quadraticCurveTo(x, y, x + R, y);
    sCtx.closePath();
    sCtx.clip();
    sCtx.fillStyle = "#0d0d0d";
    sCtx.fillRect(x, y, BOX_W, HDR_H);
    sCtx.restore();

    // Separator line between header and body
    sCtx.beginPath();
    sCtx.moveTo(x + 1, y + HDR_H);
    sCtx.lineTo(x + BOX_W - 1, y + HDR_H);
    sCtx.strokeStyle = "rgba(255,255,255,0.06)";
    sCtx.lineWidth = 1;
    sCtx.stroke();

    // Red square icon (visual anchor)
    var iconSize = 6;
    var iconX = x + 8;
    var iconY = y + HDR_H / 2 - iconSize / 2;
    sCtx.fillStyle = "#ea2845";
    sCtx.fillRect(iconX, iconY, iconSize, iconSize);

    // Entity name (after icon). Below this zoom the glyphs are sub-pixel mush.
    if (sZoom >= 0.15) {
      sCtx.fillStyle = "#e0e0e0";
      sCtx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
      sCtx.textAlign = "left";
      sCtx.textBaseline = "middle";
      sCtx.fillText(n.nameStr || n.name, iconX + iconSize + 6, y + HDR_H / 2);
    }

    // Body text is skipped below this zoom, where a row is about one pixel tall.
    var showBodyText = sZoom >= 0.35;
    if (showCols && showBodyText) {
      // Draw column rows below header
      var colY = y + HDR_H;
      for (var c = 0; c < visibleColCount; c++) {
        var col = cols[c];
        // Key, link or index glyph, then the column name beside it
        var kind = n.colKinds ? n.colKinds[c] : null;
        if (kind) {
          sDrawColumnIcon(sCtx, kind, x + 13, colY + COL_ROW_H / 2);
        }
        sCtx.fillStyle = kind === "pk" ? "#e0e0e0" : "#ccc";
        sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
        sCtx.textAlign = "left";
        sCtx.textBaseline = "middle";
        sCtx.fillText(n.colNames ? n.colNames[c] : col.name, x + 21, colY + COL_ROW_H / 2);
        // Column type (right-aligned, dimmer)
        sCtx.fillStyle = "#3b82f6";
        sCtx.font = "10px monospace";
        sCtx.textAlign = "right";
        sCtx.fillText(n.colTypes ? n.colTypes[c] : col.type, x + BOX_W - 10, colY + COL_ROW_H / 2);
        colY += COL_ROW_H;
      }
      // "+N more" indicator
      if (hasMore) {
        sCtx.fillStyle = "#666";
        sCtx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        sCtx.textAlign = "left";
        sCtx.fillText("+" + (cols.length - visibleColCount) + " more", x + 10, colY + COL_ROW_H / 2);
      }
    } else if (!showCols && showBodyText) {
      // Meta line: "N cols · ~X KB"
      sCtx.fillStyle = "#666";
      sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      sCtx.fillText(n.metaStr || "", x + 8, y + HDR_H + (BOX_H - HDR_H) / 2);
    }
  }
  sCtx.globalAlpha = 1;
  sCtx.restore();
}

// Tooltip
function sShowTooltip(entity, screenX, screenY) {
  if (!sTooltipEl) return;
  var colsHtml = "";
  var maxCols = Math.min(entity.columns.length, 12);
  for (var i = 0; i < maxCols; i++) {
    var c = entity.columns[i];
    colsHtml += '<li><span class="col-name">' + escHtml(c.name) + '</span> <span class="col-type">' + escHtml(c.type) + '</span></li>';
  }
  if (entity.columns.length > maxCols) {
    colsHtml += '<li style="color:var(--text-dim)">+ ' + (entity.columns.length - maxCols) + ' more</li>';
  }
  var tableInfo = entity.tableName && entity.tableName !== entity.name
    ? '<div class="tt-table">Table: ' + escHtml(entity.tableName) + '</div>'
    : '';
  sTooltipEl.innerHTML = '<div class="tt-name">' + escHtml(entity.name) + '</div>' +
    tableInfo +
    '<ul class="tt-cols">' + colsHtml + '</ul>' +
    '<div class="tt-size">' + formatBytes(estimateRowSize(entity)) + ' est. row size</div>';
  sTooltipEl.style.display = "block";

  // Position tooltip near cursor but keep it within viewport
  var mainRect = sCanvas.parentElement.getBoundingClientRect();
  var tx = screenX + 16;
  var ty = screenY - 10;
  sTooltipEl.style.left = tx + "px";
  sTooltipEl.style.top = ty + "px";

  // Adjust if tooltip goes off-screen
  requestAnimationFrame(function() {
    var ttRect = sTooltipEl.getBoundingClientRect();
    if (ttRect.right > mainRect.right - 8) {
      sTooltipEl.style.left = (screenX - ttRect.width - 8) + "px";
    }
    if (ttRect.bottom > mainRect.bottom - 8) {
      sTooltipEl.style.top = (screenY - ttRect.height - 8) + "px";
    }
  });
}

function sHideTooltip() {
  if (sTooltipEl) sTooltipEl.style.display = "none";
}

function sShowRelBadge(rel, screenX, screenY) {
  if (!sRelBadgeEl) return;
  var label = sRelLabel(rel.type);
  sRelBadgeEl.innerHTML =
    '<span class="rb-type">' + label + '</span>' +
    escHtml(rel.fromEntity) + '<span class="rb-arrow">&rarr;</span>' + escHtml(rel.toEntity) +
    ' <span style="color:var(--text-dim);font-size:10px">' + escHtml(rel.propertyName) + '</span>';
  sRelBadgeEl.style.display = "block";
  var tx = screenX + 16;
  var ty = screenY - 10;
  sRelBadgeEl.style.left = tx + "px";
  sRelBadgeEl.style.top = ty + "px";
  requestAnimationFrame(function() {
    var mainRect = sCanvas.parentElement.getBoundingClientRect();
    var r = sRelBadgeEl.getBoundingClientRect();
    if (r.right > mainRect.right - 8) sRelBadgeEl.style.left = (screenX - r.width - 8) + "px";
    if (r.bottom > mainRect.bottom - 8) sRelBadgeEl.style.top = (screenY - r.height - 8) + "px";
  });
}

function sHideRelBadge() {
  if (sRelBadgeEl) sRelBadgeEl.style.display = "none";
}

// Canvas resize for schema
function sResize() {
  var container = sCanvas.parentElement;
  var prevW = sW, prevH = sH;
  sW = container.clientWidth;
  sH = container.clientHeight;
  // Keep whatever was in the middle of the viewport in the middle of it.
  if (prevW && prevH) {
    sCamX += (sW - prevW) / 2;
    sCamY += (sH - prevH) / 2;
  }
  sCanvas.width = sW * sDpr;
  sCanvas.height = sH * sDpr;
  sCanvas.style.width = sW + "px";
  sCanvas.style.height = sH + "px";
  sCtx.setTransform(sDpr, 0, 0, sDpr, 0, 0);
  if (sFocusedMode && sSelectedEntity && sNodes.length > 0) {
    sComputeStarLayout(sSelectedEntity);
    sRouteAllEdges();
    sCenterCamera();
  }
  sScheduleRedraw();
}

// Sidebar click → pan to entity
function sPanToEntity(name) {
  var node = sNodeMap[name];
  if (!node) return;
  sCamX = sW / 2 - node.x;
  sCamY = sH / 2 - node.y;
  sScheduleRedraw();
}

// Sidebar highlight sync
function sSyncSidebarHighlight(entityName) {
  var rows = document.querySelectorAll(".st-row[data-entity]");
  for (var i = 0; i < rows.length; i++) {
    var match = rows[i].dataset.entity === entityName;
    rows[i].classList.toggle("st-selected", match);
    if (match) {
      rows[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

function renderSchema() {
  var sidebarEl = document.getElementById("schema-entity-list");
  sCanvas = document.getElementById("schema-canvas");
  sTooltipEl = document.getElementById("schema-tooltip");
  sRelBadgeEl = document.getElementById("schema-rel-badge");
  if (!sidebarEl || !sCanvas || schema.entities.length === 0) return;

  sCtx = sCanvas.getContext("2d");
  sDpr = window.devicePixelRatio || 1;

  // Build nodes from entities
  for (var i = 0; i < schema.entities.length; i++) {
    var entity = schema.entities[i];
    var node = {
      name: entity.name,
      entity: entity,
      x: 0, y: 0,
      w: 180, h: 52,
      sizeLabel: formatBytes(estimateRowSize(entity))
    };
    sNodes.push(node);
    sNodeMap[entity.name] = node;
  }

  sAllNodes = sNodes.slice();
  sAllNodeMap = {};
  for (var i = 0; i < sAllNodes.length; i++) {
    sAllNodeMap[sAllNodes[i].name] = sAllNodes[i];
  }
  sCacheNodeLabels(sAllNodes);
  // Starting mode only. The toolbar toggle switches it from here on.
  sFocusedMode = schema.entities.length > 7;

  // Set count badge
  document.getElementById("schema-entity-count").textContent = schema.entities.length;

  // Set dynamic sidebar title
  var sTitleEl = document.getElementById("schema-sidebar-title");
  if (sTitleEl && schema.orm) {
    sTitleEl.textContent = schema.orm.charAt(0).toUpperCase() + schema.orm.slice(1) + " Tables";
  }

  // SVG icon constants
  var ICON_TABLE = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--white)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="6" y1="5.5" x2="6" y2="14"/></svg>';
  var ICON_TABLE_OPEN = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--white)" stroke-width="1.2"><rect x="2" y="2" width="12" height="12" rx="1.5"/><rect x="2" y="2" width="12" height="3.5" rx="1.5" fill="var(--white)" opacity="0.35"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="6" y1="5.5" x2="6" y2="14"/></svg>';
  var ICON_FOLDER_CLOSED = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.2"><path d="M2 4.5h4l1.5-1.5H14v10H2z"/></svg>';
  var ICON_FOLDER_OPEN = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.2"><path d="M2 4.5h4l1.5-1.5H14v2H4L2 13V4.5z"/><path d="M4 7h11l-2 6H2z"/></svg>';
  var ICON_KEY = '<svg viewBox="0 0 16 16" fill="none" stroke="#ea2845" stroke-width="1.3"><circle cx="5.5" cy="6.5" r="2.5"/><line x1="8" y1="6.5" x2="14" y2="6.5"/><line x1="12" y1="6.5" x2="12" y2="9"/><line x1="14" y1="6.5" x2="14" y2="9"/></svg>';
  var ICON_COLUMN = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--text-dim)" stroke-width="1.2"><rect x="4" y="3" width="8" height="10" rx="1"/><line x1="6" y1="6" x2="10" y2="6"/><line x1="6" y1="8.5" x2="10" y2="8.5"/></svg>';
  var ICON_FK = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--cat-architecture)" stroke-width="1.2"><circle cx="5" cy="8" r="2.5"/><line x1="7.5" y1="8" x2="14" y2="8"/><polyline points="11,5.5 14,8 11,10.5"/></svg>';
  var ICON_INDEX = '<svg viewBox="0 0 16 16" fill="none" stroke="var(--cat-performance)" stroke-width="1.2"><line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="8" x2="10" y2="8"/><line x1="3" y1="12" x2="7" y2="12"/></svg>';

  // Tree row builder
  function sBuildTreeRow(depth, toggleId, icon, labelHtml, extra, classes, dataAttrs, iconTip) {
    var h = '<div class="st-row' + (classes ? " " + classes : "") + '"' + (dataAttrs || "") + '>';
    for (var d = 0; d < depth; d++) h += '<span class="st-indent"></span>';
    if (toggleId) {
      h += '<span class="st-toggle" data-toggle="' + toggleId + '">' + "\\u25B8" + '</span>';
    } else {
      h += '<span class="st-indent"></span>';
    }
    h += iconTip
      ? '<span class="st-icon has-tip" data-tip="' + escHtml(iconTip) + '">' + icon + '</span>'
      : '<span class="st-icon">' + icon + '</span>';
    h += '<span class="st-label">' + labelHtml + '</span>';
    if (extra) h += extra;
    h += '</div>';
    return h;
  }

  var TIP_PK = "Primary key \\u00b7 identifies the row";
  var TIP_FK = "Foreign key \\u00b7 points at another table";
  var TIP_IDX = "Indexed \\u00b7 unique or carries an index";

  // Build sidebar tree
  var sidebarHtml = "";
  var rootId = "root-tables";
  sidebarHtml += sBuildTreeRow(0, rootId, ICON_FOLDER_OPEN, '<span class="st-group-name">tables</span>', '<span class="st-count">' + schema.entities.length + '</span>', "", "");
  sidebarHtml += '<div class="st-children st-open" id="st-' + rootId + '">';

  for (var i = 0; i < schema.entities.length; i++) {
    var entity = schema.entities[i];
    var entityId = "entity-" + i;
    var displayName = entity.tableName || entity.name;
    sidebarHtml += sBuildTreeRow(1, entityId, ICON_TABLE, '<span class="st-entity-name">' + escHtml(displayName) + '</span>', "", "", ' data-entity="' + escHtml(entity.name) + '"');
    sidebarHtml += '<div class="st-children" id="st-' + entityId + '">';

    // Columns group
    if (entity.columns.length > 0) {
      var colGroupId = entityId + "-cols";
      sidebarHtml += sBuildTreeRow(2, colGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">columns</span>', '<span class="st-count">' + entity.columns.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + colGroupId + '">';
      var entityForeignKeys = sForeignKeyColumns(entity);
      for (var c = 0; c < entity.columns.length; c++) {
        var col = entity.columns[c];
        var colKind = sColumnKind(col, entityForeignKeys);
        var colIcon = colKind === "pk" ? ICON_KEY
          : colKind === "fk" ? ICON_FK
          : colKind === "idx" ? ICON_INDEX
          : ICON_COLUMN;
        var colExtra = '<span class="st-col-type">' + escHtml(col.type) + '</span>';
        if (col.defaultValue) {
          colExtra += '<span class="st-col-default">= ' + escHtml(col.defaultValue) + '</span>';
        }
        var colTags = [];
        if (col.isNullable) colTags.push("null");
        if (col.isGenerated) colTags.push("gen");
        if (col.isUnique && !col.isPrimary) colTags.push("uniq");
        if (col.hasIndex && !(col.isPrimary || col.isUnique)) colTags.push("idx");
        if (colTags.length > 0) {
          colExtra += '<span class="st-col-tags">' + colTags.join(" \\u00B7 ") + '</span>';
        }
        var colTip = colKind === "pk" ? TIP_PK
          : colKind === "fk" ? TIP_FK
          : colKind === "idx" ? TIP_IDX
          : "";
        sidebarHtml += sBuildTreeRow(3, null, colIcon, escHtml(col.name), colExtra, "", "", colTip);
      }
      sidebarHtml += '</div>';
    }

    // Primary keys group
    var pks = [];
    for (var c = 0; c < entity.columns.length; c++) {
      if (entity.columns[c].isPrimary) pks.push(entity.columns[c]);
    }
    if (pks.length > 0) {
      var pkGroupId = entityId + "-keys";
      sidebarHtml += sBuildTreeRow(2, pkGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">keys</span>', '<span class="st-count">' + pks.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + pkGroupId + '">';
      var pkColNames = [];
      for (var p = 0; p < pks.length; p++) { pkColNames.push(pks[p].name); }
      var pkLabel = escHtml((entity.tableName || entity.name).toLowerCase() + '_pkey');
      sidebarHtml += sBuildTreeRow(3, null, ICON_KEY, pkLabel, '<span class="st-col-type">(' + escHtml(pkColNames.join(", ")) + ')</span>', "", "", TIP_PK);
      sidebarHtml += '</div>';
    }

    // Foreign keys group (relations from this entity)
    if (entity.relations.length > 0) {
      var fkGroupId = entityId + "-fks";
      sidebarHtml += sBuildTreeRow(2, fkGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">foreign keys</span>', '<span class="st-count">' + entity.relations.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + fkGroupId + '">';
      for (var r = 0; r < entity.relations.length; r++) {
        var rel = entity.relations[r];
        var relLabel = sRelLabel(rel.type);
        var fkName = escHtml((entity.tableName || entity.name).toLowerCase() + '_' + rel.propertyName + '_fkey');
        sidebarHtml += sBuildTreeRow(3, null, ICON_FK, fkName, '<span class="st-col-type">(' + escHtml(rel.propertyName) + ')</span>' + '<span class="st-rel-type">' + relLabel + '</span>', "", "", TIP_FK);
      }
      sidebarHtml += '</div>';
    }

    // Indexes group (unique non-PK columns)
    var indexes = [];
    for (var c = 0; c < entity.columns.length; c++) {
      var idxCol = entity.columns[c];
      if (!idxCol.isPrimary && (idxCol.isUnique || idxCol.hasIndex)) indexes.push(idxCol);
    }
    if (indexes.length > 0) {
      var idxGroupId = entityId + "-idx";
      sidebarHtml += sBuildTreeRow(2, idxGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">indexes</span>', '<span class="st-count">' + indexes.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + idxGroupId + '">';
      for (var x = 0; x < indexes.length; x++) {
        sidebarHtml += sBuildTreeRow(3, null, ICON_INDEX, escHtml(indexes[x].name), '<span class="st-col-type">' + escHtml(indexes[x].type) + '</span>', "", "", TIP_IDX);
      }
      sidebarHtml += '</div>';
    }

    sidebarHtml += '</div>'; // close entity children
  }
  sidebarHtml += '</div>'; // close root children
  sidebarEl.innerHTML = sidebarHtml;

  // Tree click handler
  sidebarEl.addEventListener("click", function(e) {
    var toggleAlreadyHandled = false;
    var toggleEl = e.target.closest(".st-toggle");
    if (toggleEl) {
      var toggleId = toggleEl.dataset.toggle;
      var childDiv = document.getElementById("st-" + toggleId);
      if (childDiv) {
        var isOpen = childDiv.classList.toggle("st-open");
        toggleEl.textContent = isOpen ? "\\u25BE" : "\\u25B8";
        // Swap folder icon if this row has one
        var iconEl = toggleEl.parentElement.querySelector(".st-icon");
        if (iconEl) {
          var groupName = toggleEl.parentElement.querySelector(".st-group-name");
          if (groupName) {
            iconEl.innerHTML = isOpen ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED;
          } else if (toggleEl.closest(".st-row[data-entity]")) {
            iconEl.innerHTML = isOpen ? ICON_TABLE_OPEN : ICON_TABLE;
          }
        }
        toggleAlreadyHandled = true;
      }
      // If this toggle is on a non-entity row, stop here
      var row = toggleEl.closest(".st-row");
      if (!row || !row.dataset.entity) {
        e.stopPropagation();
        return;
      }
    }

    // Clicking anywhere on a group row (not just the arrow) toggles it
    if (!toggleEl) {
      var clickedRow = e.target.closest(".st-row");
      if (clickedRow && !clickedRow.dataset.entity) {
        var rowToggle = clickedRow.querySelector(".st-toggle");
        if (rowToggle) {
          var tid = rowToggle.dataset.toggle;
          var cd = document.getElementById("st-" + tid);
          if (cd) {
            var open = cd.classList.toggle("st-open");
            rowToggle.textContent = open ? "\\u25BE" : "\\u25B8";
            var ico = clickedRow.querySelector(".st-icon");
            if (ico) {
              var gn = clickedRow.querySelector(".st-group-name");
              if (gn) ico.innerHTML = open ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED;
            }
          }
          return;
        }
      }
    }

    var entityRow = e.target.closest(".st-row[data-entity]");
    if (!entityRow) return;
    var entityName = entityRow.dataset.entity;

    // Always select clicked entity (never deselect on close)
    sSelectedEntity = entityName;
    if (sSyncSidebar) sSyncSidebarHighlight(sSelectedEntity);

    // Toggle entity subtree open/closed (skip if arrow already handled it)
    if (!toggleAlreadyHandled) {
      var entityToggle = entityRow.querySelector(".st-toggle");
      if (entityToggle) {
        var eToggleId = entityToggle.dataset.toggle;
        var eChildDiv = document.getElementById("st-" + eToggleId);
        if (eChildDiv) {
          var isOpen = eChildDiv.classList.toggle("st-open");
          entityToggle.textContent = isOpen ? "\\u25BE" : "\\u25B8";
          var eIconEl = entityRow.querySelector(".st-icon");
          if (eIconEl) eIconEl.innerHTML = isOpen ? ICON_TABLE_OPEN : ICON_TABLE;
        }
      }
    }

    if (sFocusedMode) {
      sSetVisibleSubset(sSelectedEntity);
    } else {
      if (sSelectedEntity) sPanToEntity(sSelectedEntity);
      sScheduleRedraw();
    }
  });

  // Expand All / Collapse All buttons
  var expandAllBtn = document.getElementById("schema-expand-all");
  var collapseAllBtn = document.getElementById("schema-collapse-all");
  var entityListEl = document.getElementById("schema-entity-list");

  /** Closes every table, leaving the root list itself open. */
  function sCollapseTree() {
    if (!entityListEl) return;
    var children = entityListEl.querySelectorAll(".st-children");
    for (var i = 0; i < children.length; i++) {
      var isRoot = children[i].id && children[i].id.indexOf("st-root-") === 0;
      if (isRoot) continue;
      children[i].classList.remove("st-open");
    }
    var toggles = entityListEl.querySelectorAll(".st-toggle");
    for (var j = 0; j < toggles.length; j++) {
      var owned = document.getElementById("st-" + toggles[j].dataset.toggle);
      var open = owned ? owned.classList.contains("st-open") : false;
      toggles[j].textContent = open ? "\\u25BE" : "\\u25B8";
    }
    var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
    for (var k = 0; k < entityRows.length; k++) {
      var ico = entityRows[k].querySelector(".st-icon");
      if (ico) ico.innerHTML = ICON_TABLE;
    }
  }

  /** Opens one table and its columns, and scrolls the list to it. */
  function sRevealEntity(name) {
    if (!entityListEl) return;
    var rows = entityListEl.querySelectorAll(".st-row[data-entity]");
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.entity === name) { row = rows[i]; break; }
    }
    if (!row) return;
    var toggle = row.querySelector(".st-toggle");
    var subtree = toggle ? document.getElementById("st-" + toggle.dataset.toggle) : null;
    if (subtree) {
      subtree.classList.add("st-open");
      toggle.textContent = "\\u25BE";
      var icon = row.querySelector(".st-icon");
      if (icon) icon.innerHTML = ICON_TABLE_OPEN;
      var groupRow = subtree.querySelector(".st-row");
      var groupToggle = groupRow ? groupRow.querySelector(".st-toggle") : null;
      if (groupToggle) {
        var group = document.getElementById("st-" + groupToggle.dataset.toggle);
        if (group) {
          group.classList.add("st-open");
          groupToggle.textContent = "\\u25BE";
          var groupIcon = groupRow.querySelector(".st-icon");
          if (groupIcon) groupIcon.innerHTML = ICON_FOLDER_OPEN;
        }
      }
    }
    // Put the table at the top of the list, just under the sticky header, so
    // its own columns are what follows it.
    var panel = document.getElementById("schema-sidebar");
    if (!panel) return;
    var sticky = panel.querySelector(".schema-sidebar-sticky");
    var stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
    var delta = row.getBoundingClientRect().top - panel.getBoundingClientRect().top - stickyH;
    panel.scrollTop = panel.scrollTop + delta;
  }

  /** Mirrors the diagram's selection into the list, when asked to. */
  function sReflectSelection() {
    if (!sSyncSidebar) return;
    sSyncSidebarHighlight(sSelectedEntity);
    if (sSelectedEntity) {
      sRevealEntity(sSelectedEntity);
    } else {
      sCollapseTree();
    }
  }

  var syncBox = document.getElementById("schema-sync-sidebar");
  if (syncBox) {
    sSyncSidebar = syncBox.checked;
    syncBox.addEventListener("change", function() {
      sSyncSidebar = syncBox.checked;
      if (sSyncSidebar) sReflectSelection();
    });
  }

  var sidebarCollapseBtn = document.getElementById("schema-sidebar-collapse");
  var sidebarShowBtn = document.getElementById("schema-sidebar-show");
  var schemaTab = document.getElementById("tab-schema");
  function sSetSidebarCollapsed(collapsed) {
    if (!schemaTab) return;
    schemaTab.classList.toggle("sidebar-collapsed", collapsed);
    sResize();
  }
  if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener("click", function() { sSetSidebarCollapsed(true); });
  }
  if (sidebarShowBtn) {
    sidebarShowBtn.addEventListener("click", function() { sSetSidebarCollapsed(false); });
  }

  if (expandAllBtn && entityListEl) {
    expandAllBtn.addEventListener("click", function() {
      var children = entityListEl.querySelectorAll(".st-children");
      for (var i = 0; i < children.length; i++) {
        children[i].classList.add("st-open");
      }
      var toggles = entityListEl.querySelectorAll(".st-toggle");
      for (var j = 0; j < toggles.length; j++) {
        toggles[j].textContent = "\\u25BE";
      }
      var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
      for (var k = 0; k < entityRows.length; k++) {
        var ico = entityRows[k].querySelector(".st-icon");
        if (ico) ico.innerHTML = ICON_TABLE_OPEN;
      }
    });
  }

  if (collapseAllBtn && entityListEl) {
    collapseAllBtn.addEventListener("click", sCollapseTree);
  }

  // Diagram control buttons
  function sRecalcNodeSizes() {
    sApplyNodeSizes(sNodes);
  }

  var viewToggleBtn = document.getElementById("schema-toggle-view");

  function sSyncViewToggle() {
    if (!viewToggleBtn) return;
    viewToggleBtn.classList.toggle("active", !sFocusedMode);
    viewToggleBtn.setAttribute("aria-pressed", String(!sFocusedMode));
    viewToggleBtn.setAttribute("aria-label", sFocusedMode ? "Show all tables" : "Focus one table");
    viewToggleBtn.setAttribute("data-tip", sFocusedMode
      ? "All tables \\u00b7 lay out the whole schema at once"
      : "Focus \\u00b7 show one table and what it relates to");
  }

  function sShowAllTables() {
    sFocusedMode = false;
    var emptyState = document.getElementById("schema-empty-state");
    if (emptyState) emptyState.style.display = "none";
    sCanvas.style.display = "block";
    sNodes = sAllNodes.slice();
    sNodeMap = {};
    for (var i = 0; i < sNodes.length; i++) {
      sNodeMap[sNodes[i].name] = sNodes[i];
    }
    sRecalcNodeSizes();
    sComputeOverviewLayout();
    sCenterCamera();
    sSyncViewToggle();
    sScheduleRedraw();
  }

  function sFocusOneTable() {
    sFocusedMode = true;
    sSetVisibleSubset(sSelectedEntity);
    sSyncViewToggle();
    sScheduleRedraw();
  }

  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", function() {
      if (sFocusedMode) {
        sShowAllTables();
      } else {
        sFocusOneTable();
      }
    });
  }

  var showAllBtn = document.getElementById("schema-show-all");
  if (showAllBtn) {
    showAllBtn.addEventListener("click", sShowAllTables);
  }

  var recenterBtn = document.getElementById("schema-recenter");
  if (recenterBtn) {
    recenterBtn.addEventListener("click", function() {
      sCenterCamera();
      sScheduleRedraw();
    });
  }

  // Relayout after a size change so the taller boxes do not overlap.
  function sRelayoutForSizeChange() {
    sRecalcNodeSizes();
    if (sFocusedMode && sSelectedEntity) {
      sSetVisibleSubset(sSelectedEntity);
    } else if (!sFocusedMode) {
      sComputeOverviewLayout();
      sCenterCamera();
      sScheduleRedraw();
    }
  }

  var toggleColsBtn = document.getElementById("schema-toggle-cols");
  if (toggleColsBtn) {
    toggleColsBtn.addEventListener("click", function() {
      sShowAllCols = !sShowAllCols;
      if (sShowAllCols) sShowCols = true;
      toggleColsBtn.classList.toggle("active", sShowAllCols);
      toggleColsBtn.setAttribute("aria-pressed", String(sShowAllCols));
      toggleColsBtn.setAttribute("aria-label", sShowAllCols
        ? "Show the first " + S_DEFAULT_MAX_COLS + " columns"
        : "Show every column");
      toggleColsBtn.setAttribute("data-tip", sShowAllCols
        ? "First " + S_DEFAULT_MAX_COLS + " \\u00b7 go back to a short column list"
        : "Every column \\u00b7 stop cutting the list at seven");
      sRelayoutForSizeChange();
    });
  }

  var zoomRange = document.getElementById("schema-zoom-range");
  var zoomInBtn = document.getElementById("schema-zoom-in");
  var zoomOutBtn = document.getElementById("schema-zoom-out");
  var zoomValueBtn = document.getElementById("schema-zoom-value");

  function sSetZoom(next) {
    sZoom = Math.max(sZoomFloor(), Math.min(5, next));
    sSyncZoomUi();
    sScheduleRedraw();
  }

  if (zoomRange) {
    zoomRange.addEventListener("input", function() {
      sSetZoom(Number(zoomRange.value) / 100);
    });
  }
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", function() { sSetZoom(sZoom * 1.2); });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", function() { sSetZoom(sZoom / 1.2); });
  }
  if (zoomValueBtn) {
    zoomValueBtn.addEventListener("click", function() {
      sCenterCamera();
      sSyncZoomUi();
      sScheduleRedraw();
    });
  }

  var expandTablesBtn = document.getElementById("schema-expand-tables");
  if (expandTablesBtn) {
    expandTablesBtn.addEventListener("click", function() {
      sShowCols = true;
      sRecalcNodeSizes();
      if (sFocusedMode && sSelectedEntity) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sComputeOverviewLayout();
        sCenterCamera();
        sScheduleRedraw();
      }
    });
  }

  var minimizeTablesBtn = document.getElementById("schema-minimize-tables");
  if (minimizeTablesBtn) {
    minimizeTablesBtn.addEventListener("click", function() {
      sShowCols = false;
      sRecalcNodeSizes();
      if (sFocusedMode && sSelectedEntity) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sComputeOverviewLayout();
        sCenterCamera();
        sScheduleRedraw();
      }
    });
  }

  // Canvas setup
  sResize();
  window.addEventListener("resize", function() {
    if (activeTab === "schema") sResize();
  });

  // Layout initialization
  sSyncViewToggle();
  if (sFocusedMode) {
    var emptyState = document.getElementById("schema-empty-state");
    if (emptyState) emptyState.style.display = "flex";
    sCanvas.style.display = "none";
    sNodes = [];
    sNodeMap = {};
    sEdgeRoutes = {};
    sEdgeKeys = [];
  } else {
    sApplyNodeSizes(sNodes);
    sComputeOverviewLayout();
    sCenterCamera();
  }

  // Mouse interactions
  sCanvas.addEventListener("mousedown", function(e) {
    var rect = sCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = sScreenToWorld(sx, sy);
    var hit = sHitTestEntity(pos.x, pos.y);
    sDragMoved = false;
    if (hit) {
      sDragging = hit;
      sHideTooltip();
      sHideRelBadge();
    } else {
      sPanning = true;
      sPanStart = { x: e.clientX, y: e.clientY };
    }
  });

  sCanvas.addEventListener("mousemove", function(e) {
    var rect = sCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = sScreenToWorld(sx, sy);

    if (sDragging) {
      sDragMoved = true;
      sDragging.x = pos.x;
      sDragging.y = pos.y;
      sRerouteEdgesForNode(sDragging.name);
      sScheduleRedraw();
      sHideTooltip();
      sHideRelBadge();
    } else if (sPanning) {
      sDragMoved = true;
      sCamX += (e.clientX - sPanStart.x) / sZoom;
      sCamY += (e.clientY - sPanStart.y) / sZoom;
      sPanStart = { x: e.clientX, y: e.clientY };
      sScheduleRedraw();
      sHideTooltip();
      sHideRelBadge();
    } else {
      // Hover detection
      var hitEntity = sHitTestEntity(pos.x, pos.y);
      var hitRel = hitEntity ? null : sHitTestRelation(pos.x, pos.y);

      if (hitEntity !== sHoveredEntity) {
        sHoveredEntity = hitEntity;
        sCanvas.style.cursor = hitEntity ? "pointer" : "grab";
        if (hitEntity) {
          sShowTooltip(hitEntity.entity, sx, sy);
        } else {
          sHideTooltip();
        }
        sScheduleRedraw();
      } else if (hitEntity) {
        // Update tooltip position while hovering
        sTooltipEl.style.left = (sx + 16) + "px";
        sTooltipEl.style.top = (sy - 10) + "px";
      }

      if (hitRel !== sHoveredRelation) {
        sHoveredRelation = hitRel;
        if (!hitEntity) sCanvas.style.cursor = hitRel ? "pointer" : "grab";
        if (hitRel) {
          sShowRelBadge(hitRel, sx, sy);
        } else {
          sHideRelBadge();
        }
        sScheduleRedraw();
      } else if (hitRel) {
        sRelBadgeEl.style.left = (sx + 16) + "px";
        sRelBadgeEl.style.top = (sy - 10) + "px";
      }
    }
  });

  sCanvas.addEventListener("mouseup", function() {
    if (sDragging && !sDragMoved) {
      sSelectedEntity = sSelectedEntity === sDragging.name ? null : sDragging.name;
      sReflectSelection();
      if (sFocusedMode) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sScheduleRedraw();
      }
    } else if (sPanning && !sDragMoved && sSelectedEntity) {
      // A click on empty canvas clears the selection.
      sSelectedEntity = null;
      sReflectSelection();
      if (sFocusedMode) {
        sSetVisibleSubset(null);
      } else {
        sScheduleRedraw();
      }
    }
    sDragging = null;
    sPanning = false;
    sDragMoved = false;
  });

  sCanvas.addEventListener("mouseleave", function() {
    sHoveredEntity = null;
    sHoveredRelation = null;
    sHideTooltip();
    sHideRelBadge();
    sScheduleRedraw();
  });

  sCanvas.addEventListener("wheel", function(e) {
    e.preventDefault();
    // ctrlKey or metaKey means a pinch, which zooms; anything else pans.
    if (e.ctrlKey || e.metaKey) {
      var factor = e.deltaY > 0 ? 0.92 : 1.08;
      sZoom = Math.max(sZoomFloor(), Math.min(5, sZoom * factor));
    } else {
      sCamX -= e.deltaX / sZoom;
      sCamY -= e.deltaY / sZoom;
      sHideTooltip();
      sHideRelBadge();
    }
    sScheduleRedraw();
  }, { passive: false });

  // Initial draw
  sScheduleRedraw();

  // ── Schema diagnostics panel ──
  var sDiagCountEl = document.getElementById("schema-diag-count");
  var sDiagHeaderEl = document.getElementById("schema-diag-header");
  var sDiagBodyEl = document.getElementById("schema-diag-body");
  var sDiagListEl = document.getElementById("schema-diag-list");
  var sDiagChevronEl = document.getElementById("schema-diag-chevron");

  if (sDiagCountEl && sDiagHeaderEl && sDiagBodyEl && sDiagListEl && sDiagChevronEl) {
    var schemaDiags = [];
    for (var di = 0; di < diagnostics.length; di++) {
      if (diagnostics[di].category === "schema") schemaDiags.push(diagnostics[di]);
    }

    var diagCount = schemaDiags.length;
    sDiagCountEl.textContent = diagCount + (diagCount === 1 ? " issue" : " issues");
    if (diagCount > 0) {
      sDiagCountEl.classList.add("has-issues");
    }

    if (diagCount === 0) {
      sDiagListEl.innerHTML = '<div class="sd-empty">No schema issues found</div>';
    } else {
      var diagHtml = "";
      for (var si = 0; si < schemaDiags.length; si++) {
        var sd = schemaDiags[si];
        var sevColor = sd.severity === "error" ? "var(--sev-error)" : sd.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";

        // Extract entity name from message
        var sdEntityName = "";
        var onMatch = sd.message.match(/on '([^']+)'/);
        var firstMatch = sd.message.match(/'([^']+)'/);
        if (onMatch && sAllNodeMap[onMatch[1]]) {
          sdEntityName = onMatch[1];
        } else if (firstMatch && sAllNodeMap[firstMatch[1]]) {
          sdEntityName = firstMatch[1];
        }

        diagHtml += '<div class="sd-item">';
        diagHtml += '<span class="sev-dot" style="background:' + sevColor + '"></span>';
        diagHtml += '<span class="sd-rule">' + escHtml(sd.rule) + '</span>';
        if (sdEntityName) {
          diagHtml += '<span class="sd-entity" data-entity="' + escHtml(sdEntityName) + '">' + escHtml(sdEntityName) + '</span>';
        }
        diagHtml += '<span class="sd-msg">' + escHtml(sd.message) + '</span>';
        diagHtml += '</div>';
      }
      sDiagListEl.innerHTML = diagHtml;
    }

    // Toggle panel
    sDiagHeaderEl.addEventListener("click", function() {
      var isOpen = sDiagBodyEl.style.display !== "none";
      sDiagBodyEl.style.display = isOpen ? "none" : "block";
      sDiagChevronEl.classList.toggle("open", !isOpen);
      sResize();
    });

    // Entity click navigation
    sDiagListEl.addEventListener("click", function(e) {
      var entityEl = e.target.closest(".sd-entity");
      if (!entityEl) return;
      var name = entityEl.dataset.entity;
      if (!name) return;

      sSelectedEntity = name;
      sSyncSidebarHighlight(name);
      if (sFocusedMode) {
        sSetVisibleSubset(name);
      } else {
        sPanToEntity(name);
        sScheduleRedraw();
      }
    });
  }
}

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
    epCtx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
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
    epCtx.font = "bold 9px -apple-system, BlinkMacSystemFont, sans-serif";
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
      epCtx.font = "bold 8px -apple-system, BlinkMacSystemFont, sans-serif";
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
      epCtx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
      epCtx.fillStyle = "#888";
      epCtx.textAlign = "right";
      epCtx.textBaseline = "middle";
      epCtx.fillText("\u21B1", x + n.w - 8, infoY + 6);
      epCtx.textAlign = "left";
    }

    // Method name
    if (n.methodName) {
      var methodY = infoY + 18;
      epCtx.font = "9px monospace";
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

switchTab("summary");`;
}
