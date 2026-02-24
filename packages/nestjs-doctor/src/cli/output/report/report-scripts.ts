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
const CAT_META = {
  security:     { label: "Security",     color: "var(--cat-security)" },
  correctness:  { label: "Correctness",  color: "var(--cat-correctness)" },
  architecture: { label: "Architecture", color: "var(--cat-architecture)" },
  performance:  { label: "Performance",  color: "var(--cat-performance)" },
};
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
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

  // Group by category, sort by severity (track original index for source lines lookup)
  const grouped = {};
  for (const cat of CAT_ORDER) grouped[cat] = [];
  for (let i = 0; i < diagnostics.length; i++) {
    const d = diagnostics[i];
    if (grouped[d.category]) grouped[d.category].push({ d: d, origIdx: i });
  }
  for (const cat of CAT_ORDER) {
    grouped[cat].sort((a, b) => (SEV_ORDER[a.d.severity] || 0) - (SEV_ORDER[b.d.severity] || 0));
  }

  // Build sidebar rule list
  const ruleListEl = document.getElementById("diagnosis-rule-list");
  let sidebarHtml = "";
  let itemIdx = 0;
  for (const cat of CAT_ORDER) {
    const items = grouped[cat];
    if (items.length === 0) continue;
    const m = CAT_META[cat];
    sidebarHtml += '<div class="diagnosis-category" data-cat="' + cat + '">' +
      '<div class="cat-header">' +
      '<div class="cat-icon" style="background:' + m.color + '"></div>' +
      '<span class="cat-name">' + m.label + '</span>' +
      '<span class="cat-count">' + items.length + '</span>' +
      '<span class="cat-chevron">&#9660;</span>' +
      '</div><div class="cat-body">';
    for (const entry of items) {
      const d = entry.d;
      const sevColor = d.severity === "error" ? "var(--sev-error)" : d.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";
      const shortFile = d.filePath.split("/").slice(-2).join("/");
      sidebarHtml += '<div class="diagnosis-rule-item" data-idx="' + itemIdx + '" data-sev="' + d.severity + '">' +
        '<div class="sev-dot" style="background:' + sevColor + '"></div>' +
        '<div class="item-content">' +
        '<div class="item-msg">' + escHtml(d.message) + '</div>' +
        '<div class="item-file">' + escHtml(shortFile) + ':' + d.line + '</div>' +
        '</div></div>';
      itemIdx++;
    }
    sidebarHtml += '</div></div>';
  }
  ruleListEl.innerHTML = sidebarHtml;

  // Flatten diagnostics in display order for index lookup
  const orderedDiags = [];
  for (const cat of CAT_ORDER) {
    for (const entry of grouped[cat]) orderedDiags.push(entry);
  }

  // Show diagnostic in code viewer
  let activeItemEl = null;
  function showDiagnostic(idx) {
    const entry = orderedDiags[idx];
    if (!entry) return;
    const d = entry.d;
    const sourceLines = sourceLinesData[entry.origIdx];

    // Update active state in sidebar
    if (activeItemEl) activeItemEl.classList.remove("active");
    const items = ruleListEl.querySelectorAll(".diagnosis-rule-item");
    for (const item of items) {
      if (item.dataset.idx === String(idx)) {
        item.classList.add("active");
        activeItemEl = item;
        break;
      }
    }

    const emptyState = document.getElementById("diagnosis-empty-state");
    const codeView = document.getElementById("diagnosis-code-view");
    emptyState.style.display = "none";
    codeView.style.display = "block";

    // Header
    const header = document.getElementById("diagnosis-code-header");
    header.innerHTML =
      '<div class="code-filepath">' + escHtml(d.filePath) + ':' + d.line + ':' + d.column + '</div>' +
      '<span class="code-rule-badge">' + escHtml(d.rule) + '</span>' +
      '<span class="code-sev-badge ' + d.severity + '">' + d.severity + '</span>' +
      '<div class="code-message">' + escHtml(d.message) + '</div>';

    // Code body
    const codeBody = document.getElementById("diagnosis-code-body");
    if (sourceLines && sourceLines.length > 0) {
      var codeText = sourceLines.map(function(sl) { return sl.text; }).join("\\n");
      var firstLineNum = sourceLines[0].line;
      var highlightOffset = d.line - firstLineNum + 1;
      if (window.createCodeViewer) {
        window.createCodeViewer("diagnosis-code-body", codeText, {
          highlightLine: highlightOffset,
          firstLineNumber: firstLineNum,
        });
      }
      codeBody.style.display = "block";
    } else {
      codeBody.innerHTML = '<div class="no-source-msg">Source code not available for project-scoped rules</div>';
      codeBody.style.display = "block";
    }

    // Help
    const helpEl = document.getElementById("diagnosis-code-help");
    if (d.help) {
      helpEl.innerHTML = '<div class="help-label">Recommendation</div>' + escHtml(d.help);
      helpEl.style.display = "block";
    } else {
      helpEl.style.display = "none";
    }

    // Code examples
    const examplesEl = document.getElementById("diagnosis-code-examples");
    const ex = ruleExamples[d.rule];
    if (ex) {
      examplesEl.innerHTML =
        '<div class="examples-label">Examples</div>' +
        '<div class="examples-group">' +
          '<div class="example-block bad"><div class="example-tag bad">Bad</div><div class="example-code"></div></div>' +
          '<div class="example-block good"><div class="example-tag good">Good</div><div class="example-code"></div></div>' +
        '</div>';
      if (window.createCodeViewer) {
        window.createCodeViewer(examplesEl.querySelector(".example-block.bad .example-code"), ex.bad, { lineNumbers: false });
        window.createCodeViewer(examplesEl.querySelector(".example-block.good .example-code"), ex.good, { lineNumbers: false });
      }
      examplesEl.style.display = "block";
    } else {
      examplesEl.style.display = "none";
    }
  }

  // Click handler for sidebar items
  ruleListEl.addEventListener("click", (e) => {
    const item = e.target.closest(".diagnosis-rule-item");
    if (item) showDiagnostic(Number(item.dataset.idx));
  });

  // Severity filter
  let activeSev = "all";
  const pills = sidebarEl.querySelectorAll(".sev-pill");
  for (const pill of pills) {
    pill.addEventListener("click", () => {
      activeSev = pill.dataset.sev;
      for (const p of pills) p.classList.toggle("active", p === pill);
      // Filter items
      const items = ruleListEl.querySelectorAll(".diagnosis-rule-item");
      for (const item of items) {
        item.classList.toggle("hidden", activeSev !== "all" && item.dataset.sev !== activeSev);
      }
      // Update category counts and hide empty categories
      const cats = ruleListEl.querySelectorAll(".diagnosis-category");
      for (const catEl of cats) {
        const visible = catEl.querySelectorAll(".diagnosis-rule-item:not(.hidden)");
        catEl.classList.toggle("hidden", visible.length === 0);
        const countEl = catEl.querySelector(".cat-count");
        if (countEl) countEl.textContent = visible.length;
      }
      // Clear main panel if active item is filtered out
      if (activeItemEl && activeItemEl.classList.contains("hidden")) {
        activeItemEl.classList.remove("active");
        activeItemEl = null;
        document.getElementById("diagnosis-empty-state").style.display = "flex";
        document.getElementById("diagnosis-code-view").style.display = "none";
      }
    });
  }

  // Collapsible categories
  const catHeaders = ruleListEl.querySelectorAll(".cat-header");
  for (const ch of catHeaders) {
    ch.addEventListener("click", () => {
      ch.parentElement.classList.toggle("collapsed");
    });
  }
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  var PLAYGROUND_PRESETS = {
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

  var presetSelect = document.getElementById("pg-preset");
  function loadPreset(key) {
    var p = PLAYGROUND_PRESETS[key];
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
    var hint = document.getElementById("pg-context-hint");
    var scope = document.getElementById("pg-scope").value;
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
    var scope = document.getElementById("pg-scope").value;
    var options = presetSelect.querySelectorAll("option");
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var preset = PLAYGROUND_PRESETS[opt.value];
      if (preset) {
        opt.style.display = preset.scope === scope ? "" : "none";
      }
    }
    var optgroups = presetSelect.querySelectorAll("optgroup");
    for (var i = 0; i < optgroups.length; i++) {
      var group = optgroups[i];
      var visibleChildren = group.querySelectorAll("option");
      var hasVisible = false;
      for (var j = 0; j < visibleChildren.length; j++) {
        if (visibleChildren[j].style.display !== "none") { hasVisible = true; break; }
      }
      group.style.display = hasVisible ? "" : "none";
    }
    var currentPreset = PLAYGROUND_PRESETS[presetSelect.value];
    if (currentPreset && currentPreset.scope !== scope) {
      for (var i = 0; i < options.length; i++) {
        var preset = PLAYGROUND_PRESETS[options[i].value];
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
  const codeViewer = document.getElementById("pg-code-viewer");
  const codeHeader = document.getElementById("pg-code-header");
  const codeBody = document.getElementById("pg-code-body");

  let activeResultEl = null;

  function showResultSource(filePath, line) {
    const source = fileSources[filePath];
    if (!source) {
      codeViewer.style.display = "none";
      return;
    }
    const allLines = source.split("\\n");
    const start = Math.max(0, line - 6);
    const end = Math.min(allLines.length, line + 5);
    var snippet = allLines.slice(start, end).join("\\n");
    var firstLineNum = start + 1;
    var highlightOffset = line - firstLineNum + 1;
    const shortFile = filePath.split("/").slice(-2).join("/");
    codeHeader.textContent = shortFile + ":" + line;
    if (window.createCodeViewer) {
      window.createCodeViewer("pg-code-body", snippet, {
        highlightLine: highlightOffset,
        firstLineNumber: firstLineNum,
      });
    }
    codeViewer.style.display = "block";
  }

  runBtn.addEventListener("click", function() {
    errorEl.style.display = "none";
    resultList.innerHTML = "";
    codeViewer.style.display = "none";
    activeResultEl = null;

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

    var checkFn;
    try {
      checkFn = new Function("context", userCode);
    } catch (err) {
      errorEl.textContent = "Syntax error: " + err.message;
      errorEl.style.display = "block";
      resultCount.textContent = "";
      resultEmpty.style.display = "flex";
      return;
    }

    var results = [];

    if (scope === "project") {
      var projectResults = [];
      var projectCtx = {
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
      var fileEntries = Object.entries(fileSources);
      for (var fi = 0; fi < fileEntries.length; fi++) {
        var filePath = fileEntries[fi][0];
        var fileText = fileEntries[fi][1];
        var fileResults = [];
        var ctx = {
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
        for (var r = 0; r < fileResults.length; r++) results.push(fileResults[r]);
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
      resultEmpty.style.display = "flex";
      return;
    }
    resultEmpty.style.display = "none";

    var sevColors = { error: "var(--sev-error)", warning: "var(--sev-warning)", info: "var(--sev-info)" };
    var listHtml = "";
    for (var i = 0; i < results.length; i++) {
      var res = results[i];
      var shortFile = res.filePath.split("/").slice(-2).join("/");
      var sevColor = sevColors[res.severity] || sevColors.warning;
      listHtml += '<div class="pg-result-item" data-idx="' + i + '">' +
        '<div class="sev-dot" style="background:' + sevColor + '"></div>' +
        '<div class="item-content">' +
        '<div class="item-msg">' + escHtml(res.message) + '</div>' +
        '<div class="item-file">' + escHtml(shortFile) + ':' + res.line + '</div>' +
        '</div></div>';
    }
    resultList.innerHTML = listHtml;

    resultList.addEventListener("click", function(e) {
      var item = e.target.closest(".pg-result-item");
      if (!item) return;
      var idx = Number(item.dataset.idx);
      var res = results[idx];
      if (!res) return;
      if (activeResultEl) activeResultEl.classList.remove("active");
      item.classList.add("active");
      activeResultEl = item;
      showResultSource(res.filePath, res.line);
    });

    // Auto-select first result
    if (results.length > 0) {
      var firstItem = resultList.querySelector(".pg-result-item");
      if (firstItem) {
        firstItem.classList.add("active");
        activeResultEl = firstItem;
        showResultSource(results[0].filePath, results[0].line);
      }
    }
  });
}

switchTab("summary");`;
}
