export interface ReportScriptData {
	diagnosticsJson: string;
	elapsedMsJson: string;
	examplesJson: string;
	fileSourcesJson: string;
	graphJson: string;
	projectJson: string;
	providersJson: string;
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
const isMonorepo = Object.keys(fileSources).length === 0;

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
  meta.innerHTML = badges.join("");
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

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = {
  modules: document.getElementById("tab-modules"),
  diagnosis: document.getElementById("tab-diagnosis"),
  summary: document.getElementById("tab-summary"),
  lab: document.getElementById("tab-lab"),
};
const graphControls = document.getElementById("graph-controls");
const sidebar = document.getElementById("sidebar");

function switchTab(name) {
  activeTab = name;
  for (const btn of tabBtns) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
  for (const [k, el] of Object.entries(tabContents)) {
    el.classList.toggle("active", k === name);
  }
  graphControls.style.display = name === "modules" ? "flex" : "none";
  sidebar.style.display = name === "modules" ? "block" : "none";

  if (name !== "modules") {
    document.getElementById("detail").style.display = "none";
    selectedNode = null;
    exitFocus();
  }

  if (name === "diagnosis" && !diagnosisRendered) { renderDiagnosis(); diagnosisRendered = true; }
  if (name === "summary" && !summaryRendered) { renderSummary(); summaryRendered = true; }
  if (name === "lab" && !labRendered) { renderLab(); labRendered = true; }
  if (name === "modules") resize();
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
  const filterEl = document.getElementById("project-filter");
  filterEl.classList.add("visible");
  for (let i = 0; i < graph.projects.length; i++) {
    const name = graph.projects[i];
    projectColorMap[name] = PROJECT_COLORS[i % PROJECT_COLORS.length];
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    filterEl.appendChild(opt);
  }
  const legendEl = document.getElementById("project-legend");
  const div = document.createElement("hr");
  div.className = "legend-divider";
  legendEl.appendChild(div);
  for (let i = 0; i < graph.projects.length; i++) {
    const name = graph.projects[i];
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = '<div class="legend-color" style="background:' + projectColorMap[name] + ';border-color:' + projectColorMap[name] + '"></div> ' + name;
    legendEl.appendChild(item);
  }
}

function getNodeProject(n) { return n.project || null; }
function isNodeVisible(n) {
  if (activeProject === "all") return true;
  return getNodeProject(n) === activeProject;
}
function getDisplayName(n) {
  if (activeProject !== "all" && n.project && n.name.startsWith(n.project + "/")) {
    return n.name.slice(n.project.length + 1);
  }
  return n.name;
}

// ── Canvas setup ──
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;

let W, H;
function resize() {
  W = window.innerWidth - 340;
  H = window.innerHeight - 96;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// ── Build circular dep lookup ──
const circularEdges = new Set();
const circularModules = new Set();
for (const cycle of graph.circularDeps) {
  for (let i = 0; i < cycle.length; i++) {
    circularModules.add(cycle[i]);
    const next = cycle[(i + 1) % cycle.length];
    circularEdges.add(cycle[i] + "->" + next);
  }
}

// ── Detect root modules ──
const importedBy = new Set();
for (const e of graph.edges) importedBy.add(e.to);
const rootModules = new Set();
for (const m of graph.modules) {
  if (!importedBy.has(m.name)) rootModules.add(m.name);
}
for (const m of graph.modules) {
  if (m.name === "AppModule") rootModules.add(m.name);
}

// ── Create nodes with physics ──
const nodes = graph.modules.map((m, i) => {
  const angle = (2 * Math.PI * i) / graph.modules.length;
  const radius = Math.min(W, H) * 0.3;
  return {
    ...m,
    x: W / 2 + Math.cos(angle) * radius,
    y: H / 2 + Math.sin(angle) * radius,
    vx: 0, vy: 0,
    w: 0, h: 36,
  };
});

const nodeMap = new Map();
for (const n of nodes) nodeMap.set(n.name, n);

ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
function remeasureNodes() {
  for (const n of nodes) {
    const label = getDisplayName(n);
    const sub = (n.providers.length || 0) + "p " + (n.controllers.length || 0) + "c";
    const lw = ctx.measureText(label).width;
    const sw = ctx.measureText(sub).width;
    n.w = Math.max(lw, sw) + 24;
  }
}
remeasureNodes();

// ── Camera & interaction state ──
let camX = 0, camY = 0, zoom = 1;
let dragging = null;
let panning = false;
let panStart = { x: 0, y: 0 };
let selectedNode = null;
let focusNode = null;
let focusSet = null;

function getRelatedNames(name) {
  const related = new Set();
  related.add(name);
  for (const e of graph.edges) {
    if (e.from === name) related.add(e.to);
    if (e.to === name) related.add(e.from);
  }
  return related;
}

function enterFocus(n) {
  focusNode = n;
  focusSet = getRelatedNames(n.name);
  document.getElementById("focus-btn").classList.add("visible");
  document.getElementById("focus-hint").style.display = "block";
}

function exitFocus() {
  focusNode = null;
  focusSet = null;
  document.getElementById("focus-btn").classList.remove("visible");
  document.getElementById("focus-hint").style.display = "none";
}

function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / zoom + W / 2 - camX, y: (sy - H / 2) / zoom + H / 2 - camY };
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  for (const n of nodes) {
    if (pos.x >= n.x - n.w / 2 && pos.x <= n.x + n.w / 2 && pos.y >= n.y - n.h / 2 && pos.y <= n.y + n.h / 2) {
      dragging = n;
      return;
    }
  }
  panning = true;
  panStart = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mousemove", (e) => {
  if (dragging) {
    const rect = canvas.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    dragging.x = pos.x;
    dragging.y = pos.y;
    dragging.vx = 0;
    dragging.vy = 0;
  } else if (panning) {
    camX += (e.clientX - panStart.x) / zoom;
    camY += (e.clientY - panStart.y) / zoom;
    panStart = { x: e.clientX, y: e.clientY };
  }
});

canvas.addEventListener("mouseup", () => {
  if (dragging && !panning) {
    showDetail(dragging);
  }
  dragging = null;
  panning = false;
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  for (const n of nodes) {
    if (!isNodeVisible(n)) continue;
    if (pos.x >= n.x - n.w / 2 && pos.x <= n.x + n.w / 2 && pos.y >= n.y - n.h / 2 && pos.y <= n.y + n.h / 2) {
      showDetail(n);
      return;
    }
  }
  if (focusNode) exitFocus();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  zoom = Math.max(0.1, Math.min(5, zoom * factor));
}, { passive: false });

document.getElementById("close-detail").addEventListener("click", () => {
  document.getElementById("detail").style.display = "none";
  selectedNode = null;
  exitFocus();
});

document.getElementById("focus-btn").addEventListener("click", () => {
  exitFocus();
  document.getElementById("detail").style.display = "none";
  selectedNode = null;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (focusNode) exitFocus();
  }
});

document.getElementById("project-filter").addEventListener("change", (e) => {
  activeProject = e.target.value;
  remeasureNodes();
  for (const n of nodes) {
    n.vx = (Math.random() - 0.5) * 2;
    n.vy = (Math.random() - 0.5) * 2;
  }
  if (focusNode) exitFocus();
  if (selectedNode && !isNodeVisible(selectedNode)) {
    document.getElementById("detail").style.display = "none";
    selectedNode = null;
  }
});

function showDetail(n) {
  selectedNode = n;
  document.getElementById("detail-name").textContent = getDisplayName(n);
  document.getElementById("detail-path").textContent = n.filePath;
  const sections = document.getElementById("detail-sections");
  sections.innerHTML = "";
  const lists = [
    ["Providers", n.providers],
    ["Controllers", n.controllers],
    ["Imports", n.imports],
    ["Exports", n.exports],
  ];
  for (const [title, items] of lists) {
    if (items.length === 0) continue;
    const h = document.createElement("h4");
    h.textContent = title + " (" + items.length + ")";
    sections.appendChild(h);
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    sections.appendChild(ul);
  }
  if (circularModules.has(n.name)) {
    const h = document.createElement("h4");
    h.style.color = "#ea2845";
    h.textContent = "Circular Dependencies";
    sections.appendChild(h);
    for (const cycle of graph.circularDeps) {
      if (cycle.includes(n.name)) {
        const p = document.createElement("li");
        p.style.color = "#ea2845";
        p.textContent = cycle.join(" \\u2192 ") + " \\u2192 " + cycle[0];
        sections.appendChild(p);
        const key = cycle.join(",");
        const rec = graph.circularDepRecommendations[key];
        if (rec) {
          const recDiv = document.createElement("div");
          recDiv.style.cssText = "margin:6px 0 10px;padding:8px;background:rgba(234,40,69,0.08);border:1px solid rgba(234,40,69,0.2);border-radius:4px;font-size:11px;color:#ccc;line-height:1.5;white-space:pre-wrap;";
          recDiv.textContent = rec;
          sections.appendChild(recDiv);
        }
      }
    }
  }
  document.getElementById("detail").style.display = "block";
  enterFocus(n);
}

// ── Physics simulation ──
const REPULSION = 3000;
const SPRING_LENGTH = 180;
const SPRING_K = 0.004;
const DAMPING = 0.85;
const CENTER_PULL = 0.0005;

function simulate() {
  for (const a of nodes) {
    if (!isNodeVisible(a)) continue;
    for (const b of nodes) {
      if (a === b || !isNodeVisible(b)) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
    }
    a.vx += (W / 2 - a.x) * CENTER_PULL;
    a.vy += (H / 2 - a.y) * CENTER_PULL;
  }
  for (const edge of graph.edges) {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) continue;
    if (!isNodeVisible(a) || !isNodeVisible(b)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - SPRING_LENGTH) * SPRING_K;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    if (n === dragging || !isNodeVisible(n)) continue;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  }
}

function drawArrow(fromX, fromY, toX, toY, color, dashed) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);
  const headLen = 8;
  ctx.beginPath();
  if (dashed) ctx.setLineDash([4, 4]);
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - 0.4), toY - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(toX - headLen * Math.cos(angle + 0.4), toY - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function getEdgeEndpoints(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx);
  const aw = a.w / 2, ah = a.h / 2;
  const aRatio = Math.abs(dy / dx);
  let fromX, fromY;
  if (aRatio < ah / aw) {
    fromX = a.x + Math.sign(dx) * aw;
    fromY = a.y + Math.sign(dx) * aw * Math.tan(angle);
  } else {
    fromY = a.y + Math.sign(dy) * ah;
    fromX = a.x + Math.sign(dy) * ah / Math.tan(angle);
  }
  const bw = b.w / 2, bh = b.h / 2;
  const bAngle = angle + Math.PI;
  const bRatio = Math.abs(Math.sin(bAngle) / Math.cos(bAngle));
  let toX, toY;
  if (bRatio < bh / bw) {
    toX = b.x + Math.sign(Math.cos(bAngle)) * bw;
    toY = b.y + Math.sign(Math.cos(bAngle)) * bw * Math.tan(bAngle);
  } else {
    toY = b.y + Math.sign(Math.sin(bAngle)) * bh;
    toX = b.x + Math.sign(Math.sin(bAngle)) * bh / Math.tan(bAngle);
  }
  return { fromX, fromY, toX, toY };
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2 + camX, -H / 2 + camY);

  for (const edge of graph.edges) {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) continue;
    if (!isNodeVisible(a) || !isNodeVisible(b)) continue;
    const inFocus = !focusSet || (focusSet.has(edge.from) && focusSet.has(edge.to));
    const key = edge.from + "->" + edge.to;
    const isCircular = circularEdges.has(key);
    ctx.globalAlpha = inFocus ? 1 : 0.08;
    const { fromX, fromY, toX, toY } = getEdgeEndpoints(a, b);
    drawArrow(fromX, fromY, toX, toY, isCircular ? "#ea2845" : "#444", isCircular);
  }
  ctx.globalAlpha = 1;

  for (const n of nodes) {
    if (!isNodeVisible(n)) continue;
    const inFocus = !focusSet || focusSet.has(n.name);
    const isRoot = rootModules.has(n.name);
    const isCirc = circularModules.has(n.name);
    const isSelected = selectedNode === n;
    const nodeProject = getNodeProject(n);
    const projectColor = nodeProject ? projectColorMap[nodeProject] : null;
    ctx.globalAlpha = inFocus ? 1 : 0.08;

    let fill = "#1a1a2e";
    let stroke = projectColor || "#333";
    if (isRoot && !projectColor) { fill = "#1a2e1a"; stroke = "#2a5a2a"; }
    if (isCirc) { fill = "#2e1a1a"; stroke = "#ea2845"; }
    if (isSelected) { stroke = "#fff"; }

    const x = n.x - n.w / 2;
    const y = n.y - n.h / 2;
    const r = 6;

    if (projectColor && !isCirc) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + 3, y);
      ctx.lineTo(x + 3, y + n.h);
      ctx.lineTo(x + r, y + n.h);
      ctx.quadraticCurveTo(x, y + n.h, x, y + n.h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fillStyle = projectColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + n.w - r, y);
    ctx.quadraticCurveTo(x + n.w, y, x + n.w, y + r);
    ctx.lineTo(x + n.w, y + n.h - r);
    ctx.quadraticCurveTo(x + n.w, y + n.h, x + n.w - r, y + n.h);
    ctx.lineTo(x + r, y + n.h);
    ctx.quadraticCurveTo(x, y + n.h, x, y + n.h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    const displayName = getDisplayName(n);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayName, n.x, n.y - 5);
    ctx.fillStyle = "#888";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(n.providers.length + " providers, " + n.controllers.length + " controllers", n.x, n.y + 10);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function loop() {
  if (activeTab === "modules") {
    simulate();
    draw();
  }
  requestAnimationFrame(loop);
}
loop();

// ── Diagnosis Tab rendering ──
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
const CAT_META = {
  security:     { label: "Security",     color: "var(--cat-security)" },
  correctness:  { label: "Correctness",  color: "var(--cat-correctness)" },
  architecture: { label: "Architecture", color: "var(--cat-architecture)" },
  performance:  { label: "Performance",  color: "var(--cat-performance)" },
};
const CAT_ORDER = ["security", "correctness", "architecture", "performance"];

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
    fileMap[fp].sort(function(a, b) { return a.d.line - b.d.line; });
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
    const sorted = filtered.slice().sort(function(a, b) { return a.d.line - b.d.line; });

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
      const sl = sourceLinesData[sorted[0].origIdx];
      if (sl && sl.length > 0) {
        const codeText = sl.map(function(s) { return s.text; }).join("\\n");
        const firstLineNum = sl[0].line;
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < sorted.length; hi++) {
          const de = sorted[hi].d;
          const relLine = de.line - firstLineNum + 1;
          if (relLine >= 1) {
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
        innerHtml +=
          '<div class="diag-info-header">' +
            '<div class="sev-dot" style="background:' + sevColor + '"></div>' +
            '<span class="code-sev-badge ' + d.severity + '">' + d.severity + '</span>' +
            '<span class="code-rule-badge">' + escHtml(d.rule) + '</span>' +
            '<span class="diag-linecol">Ln ' + d.line + ', Col ' + d.column + '</span>' +
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

switchTab("summary");`;
}
