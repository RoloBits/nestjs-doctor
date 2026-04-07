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
let schemaRendered = false;
let endpointsRendered = false;

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = {
  modules: document.getElementById("tab-modules"),
  diagnosis: document.getElementById("tab-diagnosis"),
  summary: document.getElementById("tab-summary"),
  lab: document.getElementById("tab-lab"),
  schema: document.getElementById("tab-schema"),
  endpoints: document.getElementById("tab-endpoints"),
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
  if (name === "schema" && !schemaRendered) { renderSchema(); schemaRendered = true; }
  if (name === "endpoints" && !endpointsRendered) { renderEndpoints(); endpointsRendered = true; }
  if (name === "modules") resize();
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
let simulationHeat = 1;

function wakeSimulation(heat = 1) {
  simulationHeat = Math.max(simulationHeat, heat);
}

let W, H;
function resize() {
  W = window.innerWidth - 340;
  H = window.innerHeight - 96;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wakeSimulation(0.4);
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
      wakeSimulation(0.35);
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
  wakeSimulation(0.25);
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
    n.vx = (Math.random() - 0.5) * 0.8;
    n.vy = (Math.random() - 0.5) * 0.8;
  }
  wakeSimulation();
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
const REPULSION = 2400;
const SPRING_LENGTH = 180;
const SPRING_K = 0.0035;
const DAMPING = 0.8;
const CENTER_PULL = 0.00035;
const HEAT_DECAY = 0.985;
const HEAT_SLEEP_THRESHOLD = 0.02;
const SPEED_SLEEP_THRESHOLD = 0.03;

function simulate() {
  if (simulationHeat <= 0 && !dragging && !panning) {
    return;
  }

  const forceScale = Math.max(simulationHeat, HEAT_SLEEP_THRESHOLD);

  for (const a of nodes) {
    if (!isNodeVisible(a)) continue;
    for (const b of nodes) {
      if (a === b || !isNodeVisible(b)) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (REPULSION * forceScale) / (dist * dist);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
    }
    a.vx += (W / 2 - a.x) * CENTER_PULL * forceScale;
    a.vy += (H / 2 - a.y) * CENTER_PULL * forceScale;
  }
  for (const edge of graph.edges) {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) continue;
    if (!isNodeVisible(a) || !isNodeVisible(b)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - SPRING_LENGTH) * SPRING_K * forceScale;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  let maxSpeed = 0;
  for (const n of nodes) {
    if (n === dragging || !isNodeVisible(n)) continue;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    const speed = Math.abs(n.vx) + Math.abs(n.vy);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  if (!dragging && !panning) {
    simulationHeat *= HEAT_DECAY;
    if (simulationHeat < HEAT_SLEEP_THRESHOLD && maxSpeed < SPEED_SLEEP_THRESHOLD) {
      simulationHeat = 0;
      for (const n of nodes) {
        n.vx = 0;
        n.vy = 0;
      }
    }
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

// dagre layout computation
function sComputeDagreLayout() {
  if (typeof dagre === "undefined") {
    // Fallback: simple grid layout
    var cols = Math.max(1, Math.ceil(Math.sqrt(sNodes.length)));
    for (var i = 0; i < sNodes.length; i++) {
      sNodes[i].x = 300 + (i % cols) * 250;
      sNodes[i].y = 200 + Math.floor(i / cols) * 120;
    }
    sRouteAllEdges();
    return;
  }

  var g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(function() { return {}; });

  for (var i = 0; i < sNodes.length; i++) {
    g.setNode(sNodes[i].name, { width: sNodes[i].w, height: sNodes[i].h });
  }

  var seenEdge = {};
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    if (!sNodeMap[rel.fromEntity] || !sNodeMap[rel.toEntity]) continue;
    var ek = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (seenEdge[ek]) continue;
    seenEdge[ek] = true;
    g.setEdge(rel.fromEntity, rel.toEntity);
  }

  dagre.layout(g);

  for (var i = 0; i < sNodes.length; i++) {
    var laid = g.node(sNodes[i].name);
    if (laid) {
      sNodes[i].x = laid.x;
      sNodes[i].y = laid.y;
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

  var showCols = sShowCols !== null ? sShowCols : sNodes.length <= 5;
  for (var i = 0; i < sNodes.length; i++) {
    var cols = sNodes[i].entity.columns;
    var visCount = showCols ? Math.min(cols.length, 7) : 0;
    var hasMore = showCols && cols.length > 7;
    sNodes[i].h = showCols ? 24 + visCount * 16 + (hasMore ? 16 : 0) + 8 : 52;
    sNodes[i].w = 180;
  }

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
  sZoom = Math.min(1.5, Math.min(padW / (graphW || 1), padH / (graphH || 1)));
  sZoom = Math.max(0.2, sZoom);
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
    var mid = sPolylineMidpoint(points);
    var labelStr = sRelLabel(rel.type);
    sCtx.font = (10 / sZoom) + "px monospace";
    sCtx.textAlign = "center";
    sCtx.textBaseline = "bottom";
    sCtx.fillStyle = isHovered ? "#ffffff" : "#666";
    sCtx.fillText(labelStr, mid.x, mid.y - 4 / sZoom);
  }
  sCtx.globalAlpha = 1;

  // Draw entity boxes
  var BOX_W = 180;
  var R = 6;
  var HDR_H = 24;
  var COL_ROW_H = 16;
  var MAX_VISIBLE_COLS = 7;
  var showCols = sShowCols !== null ? sShowCols : sNodes.length <= 5;

  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    var cols = n.entity.columns;
    var visibleColCount = showCols ? Math.min(cols.length, MAX_VISIBLE_COLS) : 0;
    var hasMore = showCols && cols.length > MAX_VISIBLE_COLS;
    var BOX_H = showCols
      ? HDR_H + visibleColCount * COL_ROW_H + (hasMore ? COL_ROW_H : 0) + 8
      : 52;
    n.w = BOX_W;
    n.h = BOX_H;

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

    // Entity name (after icon)
    sCtx.fillStyle = "#e0e0e0";
    sCtx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
    sCtx.textAlign = "left";
    sCtx.textBaseline = "middle";
    var nameStr = n.name;
    var nameStartX = iconX + iconSize + 6;
    var maxNameW = BOX_W - (nameStartX - x) - 8;
    while (sCtx.measureText(nameStr).width > maxNameW && nameStr.length > 3) {
      nameStr = nameStr.slice(0, -1);
    }
    if (nameStr !== n.name) nameStr += "\\u2026";
    sCtx.fillText(nameStr, nameStartX, y + HDR_H / 2);

    if (showCols) {
      // Draw column rows below header
      var colY = y + HDR_H;
      for (var c = 0; c < visibleColCount; c++) {
        var col = cols[c];
        // Column name (left-aligned)
        sCtx.fillStyle = "#ccc";
        sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
        sCtx.textAlign = "left";
        sCtx.textBaseline = "middle";
        sCtx.fillText(col.name, x + 10, colY + COL_ROW_H / 2);
        // Column type (right-aligned, dimmer)
        sCtx.fillStyle = "#3b82f6";
        sCtx.font = "10px monospace";
        sCtx.textAlign = "right";
        var typeStr = col.type;
        while (sCtx.measureText(typeStr).width > 60 && typeStr.length > 3) {
          typeStr = typeStr.slice(0, -1);
        }
        if (typeStr !== col.type) typeStr += "\\u2026";
        sCtx.fillText(typeStr, x + BOX_W - 10, colY + COL_ROW_H / 2);
        colY += COL_ROW_H;
      }
      // "+N more" indicator
      if (hasMore) {
        sCtx.fillStyle = "#666";
        sCtx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        sCtx.textAlign = "left";
        sCtx.fillText("+" + (cols.length - MAX_VISIBLE_COLS) + " more", x + 10, colY + COL_ROW_H / 2);
      }
    } else {
      // Meta line: "N cols · ~X KB"
      sCtx.fillStyle = "#666";
      sCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      var metaStr = n.entity.columns.length + " cols  \\u00b7  " + n.sizeLabel;
      var metaFull = metaStr;
      var metaX = x + 8;
      var maxMetaW = BOX_W - 16;
      while (sCtx.measureText(metaStr).width > maxMetaW && metaStr.length > 3) {
        metaStr = metaStr.slice(0, -1);
      }
      if (metaStr.length < metaFull.length) metaStr += "\\u2026";
      sCtx.fillText(metaStr, metaX, y + HDR_H + (BOX_H - HDR_H) / 2);
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
  sW = container.clientWidth;
  sH = container.clientHeight;
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
  function sBuildTreeRow(depth, toggleId, icon, labelHtml, extra, classes, dataAttrs) {
    var h = '<div class="st-row' + (classes ? " " + classes : "") + '"' + (dataAttrs || "") + '>';
    for (var d = 0; d < depth; d++) h += '<span class="st-indent"></span>';
    if (toggleId) {
      h += '<span class="st-toggle" data-toggle="' + toggleId + '">' + "\\u25B8" + '</span>';
    } else {
      h += '<span class="st-indent"></span>';
    }
    h += '<span class="st-icon">' + icon + '</span>';
    h += '<span class="st-label">' + labelHtml + '</span>';
    if (extra) h += extra;
    h += '</div>';
    return h;
  }

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
      for (var c = 0; c < entity.columns.length; c++) {
        var col = entity.columns[c];
        var colIcon = col.isPrimary ? ICON_KEY : ICON_COLUMN;
        var colExtra = '<span class="st-col-type">' + escHtml(col.type) + '</span>';
        if (col.defaultValue) {
          colExtra += '<span class="st-col-default">= ' + escHtml(col.defaultValue) + '</span>';
        }
        var colTags = [];
        if (col.isNullable) colTags.push("null");
        if (col.isGenerated) colTags.push("gen");
        if (col.isUnique && !col.isPrimary) colTags.push("uniq");
        if (colTags.length > 0) {
          colExtra += '<span class="st-col-tags">' + colTags.join(" \\u00B7 ") + '</span>';
        }
        sidebarHtml += sBuildTreeRow(3, null, colIcon, escHtml(col.name), colExtra, "", "");
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
      sidebarHtml += sBuildTreeRow(3, null, ICON_KEY, pkLabel, '<span class="st-col-type">(' + escHtml(pkColNames.join(", ")) + ')</span>', "", "");
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
        sidebarHtml += sBuildTreeRow(3, null, ICON_FK, fkName, '<span class="st-col-type">(' + escHtml(rel.propertyName) + ')</span>' + '<span class="st-rel-type">' + relLabel + '</span>', "", "");
      }
      sidebarHtml += '</div>';
    }

    // Indexes group (unique non-PK columns)
    var indexes = [];
    for (var c = 0; c < entity.columns.length; c++) {
      if (entity.columns[c].isUnique && !entity.columns[c].isPrimary) indexes.push(entity.columns[c]);
    }
    if (indexes.length > 0) {
      var idxGroupId = entityId + "-idx";
      sidebarHtml += sBuildTreeRow(2, idxGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">indexes</span>', '<span class="st-count">' + indexes.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + idxGroupId + '">';
      for (var x = 0; x < indexes.length; x++) {
        sidebarHtml += sBuildTreeRow(3, null, ICON_INDEX, escHtml(indexes[x].name), '<span class="st-col-type">' + escHtml(indexes[x].type) + '</span>', "", "");
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
    sSyncSidebarHighlight(sSelectedEntity);

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
    collapseAllBtn.addEventListener("click", function() {
      var children = entityListEl.querySelectorAll(".st-children");
      for (var i = 0; i < children.length; i++) {
        // Keep root-level groups open so entity list stays visible
        if (children[i].id && children[i].id.indexOf("st-root-") === 0) continue;
        children[i].classList.remove("st-open");
      }
      var toggles = entityListEl.querySelectorAll(".st-toggle");
      for (var j = 0; j < toggles.length; j++) {
        toggles[j].textContent = "\\u25B8";
      }
      var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
      for (var k = 0; k < entityRows.length; k++) {
        var ico = entityRows[k].querySelector(".st-icon");
        if (ico) ico.innerHTML = ICON_TABLE;
      }
    });
  }

  // Diagram control buttons
  function sRecalcNodeSizes() {
    var showCols = sShowCols !== null ? sShowCols : sNodes.length <= 5;
    for (var i = 0; i < sNodes.length; i++) {
      var cols = sNodes[i].entity.columns;
      var visCount = showCols ? Math.min(cols.length, 7) : 0;
      var hasMore = showCols && cols.length > 7;
      sNodes[i].h = showCols ? 24 + visCount * 16 + (hasMore ? 16 : 0) + 8 : 52;
      sNodes[i].w = 180;
    }
  }

  var recenterBtn = document.getElementById("schema-recenter");
  if (recenterBtn) {
    recenterBtn.addEventListener("click", function() {
      sCenterCamera();
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
        sRouteAllEdges();
        if (typeof dagre !== "undefined") sComputeDagreLayout();
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
        sRouteAllEdges();
        if (typeof dagre !== "undefined") sComputeDagreLayout();
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
  if (sFocusedMode) {
    var emptyState = document.getElementById("schema-empty-state");
    if (emptyState) emptyState.style.display = "flex";
    sCanvas.style.display = "none";
    sNodes = [];
    sNodeMap = {};
    sEdgeRoutes = {};
    sEdgeKeys = [];
  } else {
    sComputeDagreLayout();
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
      sSyncSidebarHighlight(sSelectedEntity);
      if (sFocusedMode) {
        sSetVisibleSubset(sSelectedEntity);
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
    var factor = e.deltaY > 0 ? 0.92 : 1.08;
    sZoom = Math.max(0.2, Math.min(5, sZoom * factor));
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
    if (n.order >= 0) {
      var orderLabel = "#" + (n.order + 1);
      epCtx.font = "bold 8px -apple-system, BlinkMacSystemFont, sans-serif";
      var orderW = epCtx.measureText(orderLabel).width + 8;
      epRoundRect(epCtx, badgeRight + 4, infoY, orderW, 12, 3);
      epCtx.fillStyle = "rgba(255,255,255,0.08)";
      epCtx.fill();
      epCtx.fillStyle = "#999";
      epCtx.textBaseline = "middle";
      epCtx.fillText(orderLabel, badgeRight + 8, infoY + 6);
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
  epTooltipEl.innerHTML = '<div class="tt-name">' + escHtml(node.className) + '</div>' +
    '<div class="tt-table" style="color:' + color + '">' + escHtml(node.type) + '</div>' +
    methodHtml + condLabel;
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
