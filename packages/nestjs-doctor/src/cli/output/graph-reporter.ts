import {
	findCircularDeps,
	type ModuleGraph,
} from "../../engine/module-graph.js";
import type { DiagnoseResult } from "../../types/result.js";

interface SerializedModuleNode {
	controllers: string[];
	exports: string[];
	filePath: string;
	imports: string[];
	name: string;
	project?: string;
	providers: string[];
}

interface SerializedModuleGraph {
	circularDepRecommendations: Record<string, string>;
	circularDeps: string[][];
	edges: Array<{ from: string; to: string }>;
	modules: SerializedModuleNode[];
	projects: string[];
}

function serializeModuleGraph(
	graph: ModuleGraph,
	result: DiagnoseResult,
	projects?: string[]
): SerializedModuleGraph {
	const modules: SerializedModuleNode[] = [];
	for (const node of graph.modules.values()) {
		const slashIdx = node.name.indexOf("/");
		const project =
			projects && projects.length > 0 && slashIdx !== -1
				? node.name.slice(0, slashIdx)
				: undefined;
		modules.push({
			name: node.name,
			filePath: node.filePath,
			imports: node.imports,
			exports: node.exports,
			providers: node.providers,
			controllers: node.controllers,
			project,
		});
	}

	const edges: Array<{ from: string; to: string }> = [];
	for (const [from, targets] of graph.edges) {
		for (const to of targets) {
			edges.push({ from, to });
		}
	}

	const circularDeps = findCircularDeps(graph);

	const circularDepRecommendations: Record<string, string> = {};
	for (const diag of result.diagnostics) {
		if (diag.rule !== "architecture/no-circular-module-deps") {
			continue;
		}
		for (const cycle of circularDeps) {
			const cycleStr = cycle.join(" -> ");
			if (diag.message.includes(cycleStr)) {
				circularDepRecommendations[cycle.join(",")] = diag.help;
			}
		}
	}

	return {
		modules,
		edges,
		circularDeps,
		circularDepRecommendations,
		projects: projects ?? [],
	};
}

export function generateGraphHtml(
	moduleGraph: ModuleGraph,
	result: DiagnoseResult,
	options?: { projects?: string[] }
): string {
	const graph = serializeModuleGraph(moduleGraph, result, options?.projects);
	const graphJson = JSON.stringify(graph);
	const projectJson = JSON.stringify({
		name: result.project.name,
		score: result.score,
		moduleCount: result.project.moduleCount,
		fileCount: result.project.fileCount,
	});

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nestjs-doctor — Module Graph</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
canvas { display: block; cursor: grab; }
canvas:active { cursor: grabbing; }

#header {
  position: fixed; top: 0; left: 0; right: 0;
  padding: 12px 20px;
  background: rgba(10,10,10,0.9);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; gap: 16px;
  z-index: 10;
  backdrop-filter: blur(8px);
}
#header h1 { font-size: 14px; font-weight: 600; color: #fff; }
#header .badge {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
}
#header .score { color: #4ade80; }
#header .spacer { flex: 1; }
#header .github-link {
  display: flex; align-items: center;
  text-decoration: none; color: #ccc;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  transition: background 0.15s, color 0.15s;
}
#header .github-link:hover { background: rgba(255,255,255,0.12); color: #fff; }
#header .github-link svg { fill: currentColor; }

#sidebar {
  position: fixed; top: 45px; left: 0; bottom: 0;
  width: 340px;
  background: rgba(17,17,17,0.95);
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 16px;
  font-size: 12px;
  z-index: 10;
  overflow-y: auto;
  backdrop-filter: blur(8px);
}
#sidebar h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 8px; }
#sidebar .divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 14px 0; }
.legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.legend-color { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
.legend-line { width: 20px; height: 2px; flex-shrink: 0; }
#sidebar dl { margin: 0; }
#sidebar dt { color: #fff; font-weight: 600; margin-top: 8px; }
#sidebar dt:first-of-type { margin-top: 0; }
#sidebar dd { color: #999; margin: 2px 0 0 0; line-height: 1.4; }
#sidebar code { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-size: 11px; }

#detail {
  position: fixed; top: 45px; right: 0; bottom: 0;
  width: 300px;
  background: rgba(17,17,17,0.95);
  border-left: 1px solid rgba(255,255,255,0.08);
  padding: 16px;
  font-size: 13px;
  z-index: 10;
  display: none;
  overflow-y: auto;
  backdrop-filter: blur(8px);
}
#detail h2 { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 4px; }
#detail .filepath { font-size: 11px; color: #888; word-break: break-all; margin-bottom: 12px; }
#detail h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin: 10px 0 4px; }
#detail ul { list-style: none; padding: 0; }
#detail li { padding: 2px 0; color: #ccc; font-size: 12px; }
#detail .close-btn {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; color: #666; cursor: pointer; font-size: 18px;
}
#detail .close-btn:hover { color: #fff; }

#header .focus-btn {
  cursor: pointer; font-size: 11px; display: none;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: #ccc;
}
#header .focus-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
#header .focus-btn.active { background: rgba(234,40,69,0.15); border-color: #ea2845; color: #ea2845; }
#header .focus-btn.visible { display: inline-block; }

#project-filter {
  display: none; font-size: 11px; padding: 2px 8px; border-radius: 4px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: #ccc; cursor: pointer; outline: none;
}
#project-filter:hover { background: rgba(255,255,255,0.12); color: #fff; }
#project-filter.visible { display: inline-block; }


#focus-hint {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: rgba(17,17,17,0.95); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px; padding: 6px 14px; font-size: 12px; color: #888;
  z-index: 10; display: none;
}
</style>
</head>
<body>
<div id="header">
  <h1>nestjs-doctor</h1>
  <span class="badge" id="module-count"></span>
  <span class="badge score" id="score-badge"></span>
  <button class="badge focus-btn" id="focus-btn">Focus</button>
  <select id="project-filter"><option value="all">All projects</option></select>
  <div class="spacer"></div>
  <a class="github-link" href="https://github.com/RoloBits/nestjs-doctor" target="_blank" rel="noopener">
    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  </a>
</div>

<canvas id="graph"></canvas>

<div id="sidebar">
  <h3>Legend</h3>
  <div class="legend-item"><div class="legend-color" style="background:#1a1a2e;border-color:#333"></div> Module</div>
  <div class="legend-item"><div class="legend-color" style="background:#1a2e1a;border-color:#2a5a2a"></div> Root module</div>
  <div class="legend-item"><div class="legend-color" style="background:#2e1a1a;border-color:#ea2845"></div> Circular dependency</div>
  <div class="legend-item"><div class="legend-line" style="background:#444"></div> Import</div>
  <div class="legend-item"><div class="legend-line" style="background:#ea2845;border-top:1px dashed #ea2845;height:0"></div> Circular import</div>
  <div id="project-legend"></div>
  <hr class="divider">
  <h3>NestJS Concepts</h3>
  <dl>
    <dt>Providers</dt>
    <dd>Injectable services (business logic, repositories, helpers) registered in the module's <code>providers</code> array. The core building block of NestJS DI.</dd>
    <dt>Controllers</dt>
    <dd>HTTP request handlers (routes) registered in the module's <code>controllers</code> array. They receive requests and delegate to providers.</dd>
    <dt>Imports</dt>
    <dd>Other modules this module depends on. Importing a module makes its exported providers available for injection.</dd>
    <dt>Exports</dt>
    <dd>Providers this module makes available to other modules that import it. Without exporting, providers stay private to the module.</dd>
    <dt style="color:#ea2845">Circular Dependency</dt>
    <dd>A cycle in module <strong style="color:#ccc">imports</strong>: Module A imports Module B, and Module B imports Module A (directly or through a chain like A &rarr; B &rarr; C &rarr; A). Because NestJS resolves modules in order, one side hasn't finished initializing — so its <strong style="color:#ccc">providers</strong> are <code>undefined</code> when the other tries to inject them.</dd>
    <dd style="margin-top:4px">This signals <strong style="color:#ccc">tangled responsibilities</strong> — two modules that can't work without each other should probably be one module, or the shared logic should be extracted into its own module.</dd>
    <dd style="margin-top:4px"><strong style="color:#ccc">Fix:</strong> Extract the shared providers into a new module both can import, breaking the cycle. This is the proper long-term solution.</dd>
    <dd style="margin-top:4px"><code>forwardRef()</code> tells NestJS to defer resolving a dependency until both modules are loaded. It works, but it's a <strong style="color:#ccc">band-aid</strong> — the cycle still exists, the code is harder to follow, and adding more modules to the chain makes it fragile. Use it only as a temporary fix while you refactor.</dd>
  </dl>
</div>

<div id="detail">
  <button class="close-btn" id="close-detail">&times;</button>
  <h2 id="detail-name"></h2>
  <div class="filepath" id="detail-path"></div>
  <div id="detail-sections"></div>
</div>

<div id="focus-hint">Focused view — click empty space or press Esc to exit</div>

<script>
const graph = ${graphJson};
const project = ${projectJson};

document.getElementById("module-count").textContent = graph.modules.length + " modules";
document.getElementById("score-badge").textContent = "Score: " + project.score.value + " — " + project.score.label;

// Project colors and filter setup
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
  // Build project legend
  const legendEl = document.getElementById("project-legend");
  for (let i = 0; i < graph.projects.length; i++) {
    const name = graph.projects[i];
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = '<div class="legend-color" style="background:' + projectColorMap[name] + ';border-color:' + projectColorMap[name] + '"></div> ' + name;
    legendEl.appendChild(item);
  }
}

function getNodeProject(n) {
  return n.project || null;
}

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

const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;

let W, H;
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// Build circular dep lookup
const circularEdges = new Set();
const circularModules = new Set();
for (const cycle of graph.circularDeps) {
  for (let i = 0; i < cycle.length; i++) {
    circularModules.add(cycle[i]);
    const next = cycle[(i + 1) % cycle.length];
    circularEdges.add(cycle[i] + "->" + next);
  }
}

// Detect root module
const importedBy = new Set();
for (const e of graph.edges) importedBy.add(e.to);
const rootModules = new Set();
for (const m of graph.modules) {
  if (!importedBy.has(m.name)) rootModules.add(m.name);
}
// Heuristic: AppModule is always root
for (const m of graph.modules) {
  if (m.name === "AppModule") rootModules.add(m.name);
}

// Create nodes with physics
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

// Measure node widths
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

// Camera
let camX = 0, camY = 0, zoom = 1;
let dragging = null;
let panning = false;
let panStart = { x: 0, y: 0 };
let selectedNode = null;
let focusNode = null;
let focusSet = null; // Set of node names visible in focus mode

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
  document.getElementById("focus-btn").classList.add("active");
  document.getElementById("focus-btn").textContent = "Unfocus";
  document.getElementById("focus-hint").style.display = "block";
}

function exitFocus() {
  focusNode = null;
  focusSet = null;
  document.getElementById("focus-btn").classList.remove("active");
  document.getElementById("focus-btn").textContent = "Focus";
  document.getElementById("focus-hint").style.display = "none";
}

function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / zoom + W / 2 - camX, y: (sy - H / 2) / zoom + H / 2 - camY };
}

canvas.addEventListener("mousedown", (e) => {
  const pos = screenToWorld(e.clientX, e.clientY);
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
    const pos = screenToWorld(e.clientX, e.clientY);
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
  const pos = screenToWorld(e.clientX, e.clientY);
  for (const n of nodes) {
    if (!isNodeVisible(n)) continue;
    if (pos.x >= n.x - n.w / 2 && pos.x <= n.x + n.w / 2 && pos.y >= n.y - n.h / 2 && pos.y <= n.y + n.h / 2) {
      showDetail(n);
      return;
    }
  }
  // Clicked empty space — exit focus
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
  document.getElementById("focus-btn").classList.remove("visible");
  exitFocus();
});

document.getElementById("focus-btn").addEventListener("click", () => {
  if (focusNode) {
    exitFocus();
  } else if (selectedNode) {
    enterFocus(selectedNode);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (focusNode) exitFocus();
  }
});

document.getElementById("project-filter").addEventListener("change", (e) => {
  activeProject = e.target.value;
  remeasureNodes();
  // Reset physics so nodes rearrange
  for (const n of nodes) {
    n.vx = (Math.random() - 0.5) * 2;
    n.vy = (Math.random() - 0.5) * 2;
  }
  if (focusNode) exitFocus();
  if (selectedNode && !isNodeVisible(selectedNode)) {
    document.getElementById("detail").style.display = "none";
    selectedNode = null;
    document.getElementById("focus-btn").classList.remove("visible");
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
        p.textContent = cycle.join(" \u2192 ") + " \u2192 " + cycle[0];
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
  document.getElementById("focus-btn").classList.add("visible");
  if (focusNode) enterFocus(n);
}

// Physics simulation
const REPULSION = 3000;
const SPRING_LENGTH = 180;
const SPRING_K = 0.004;
const DAMPING = 0.85;
const CENTER_PULL = 0.0005;

function simulate() {
  for (const a of nodes) {
    if (!isNodeVisible(a)) continue;
    // Repulsion from other nodes
    for (const b of nodes) {
      if (a === b || !isNodeVisible(b)) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
    }
    // Center pull
    a.vx += (W / 2 - a.x) * CENTER_PULL;
    a.vy += (H / 2 - a.y) * CENTER_PULL;
  }

  // Spring forces along edges
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

  // From node edge
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

  // To node edge
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

  // Apply camera transform
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2 + camX, -H / 2 + camY);

  // Draw edges
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

  // Draw nodes
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

    // Draw project color accent (left border) for monorepo nodes
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
  simulate();
  draw();
  requestAnimationFrame(loop);
}

loop();
</script>
</body>
</html>`;
}
