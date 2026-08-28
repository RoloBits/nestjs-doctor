export const CHROME = `
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
      const phaseCaption = mgPhaseParts()
        .map((s) => s.label + " " + mgFormatMs(s.ms))
        .join(" \\u00b7 ");
      badges.push('<span class="meta-badge" id="boot-badge" style="cursor:pointer" data-tip="From bootstrap start until the app was listening, measured by the nestjs-doctor snippet in your main.ts.' +
        (phaseCaption ? " " + mgEsc(phaseCaption) + "." : "") +
        ' Slowest construction chain: ' +
        mgEsc(bootName) + ' \\u2014 click to open it in the modules graph">time to start \\u2248 ' + mgEsc(mgFormatMs(graph.startupMs)) + '</span>');
    } else if (bootMs > 0) {
      badges.push('<span class="meta-badge" id="boot-badge" style="cursor:pointer" data-tip="Slowest construction chain: ' +
        mgEsc(bootName) + ' \\u2014 click to open it in the modules graph. Add startupMs to the dump for full time-to-start">boot \\u2248 ' + mgEsc(mgFormatMs(bootMs)) + '</span>');
    }
  }
  meta.innerHTML = badges.join("");
  const bootBadge = document.getElementById("boot-badge");
  if (bootBadge) {
    bootBadge.addEventListener("click", () => { window.__ndTrack?.("boot_trace_opened"); mgJumpToSlowestBoot(); });
  }
})();

// ── Floating tooltip for data-tip elements inside clipping containers ──
(function() {
  const tip = document.createElement("div");
  tip.className = "schema-tooltip";
  tip.id = "mg-float-tip";
  document.body.appendChild(tip);
  let shown = null;
  function bind(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.addEventListener("mouseover", (ev) => {
      const el = ev.target.closest("[data-tip]");
      if (!el || !root.contains(el)) {
        shown = null;
        tip.style.display = "none";
        return;
      }
      if (el === shown) return;
      // Skips the tip when the name is fully visible.
      if (el.classList.contains("mg-trace-name") && el.scrollWidth <= el.clientWidth) {
        shown = null;
        tip.style.display = "none";
        return;
      }
      shown = el;
      tip.textContent = el.getAttribute("data-tip");
      // A leftover left offset would constrain the width measurement.
      tip.style.left = "0px";
      tip.style.top = "0px";
      tip.style.display = "block";
      const r = el.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      const x = Math.max(8, Math.min(r.left, window.innerWidth - tr.width - 8));
      let y = r.top - tr.height - 6;
      if (y < 8) y = r.bottom + 6;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    });
    root.addEventListener("mouseleave", () => {
      shown = null;
      tip.style.display = "none";
    });
  }
  bind("mg-dock");
  bind("header-meta");
  bind("detail-badges");
})();

// ── Diagnosis count badge ──
function diagIsNotScored(d) {
  return !!(d.surfaces && d.surfaces.indexOf("score") === -1);
}
/** Matches what the tab lists: the not-scored ones only once they are shown. */
function setDiagnosisBadge(withNotScored) {
  const badge = document.getElementById("diagnosis-count-badge");
  if (!badge) return;
  let shown = 0;
  for (let i = 0; i < diagnostics.length; i++) {
    if (withNotScored || !diagIsNotScored(diagnostics[i])) shown++;
  }
  badge.textContent = shown;
  badge.classList.toggle("clean", diagnostics.length === 0);
}
setDiagnosisBadge(false);

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


  if (name === "diagnosis" && !diagnosisRendered) { renderDiagnosis(); diagnosisRendered = true; }
  if (name === "summary" && !summaryRendered) { REPORT_APP.renderSummary(REPORT); summaryRendered = true; }
  if (name === "lab" && !labRendered) { renderLab(); labRendered = true; }
  if (name === "schema" && !schemaRendered) { renderSchema(); schemaRendered = true; }
  if (name === "endpoints" && !endpointsRendered) { renderEndpoints(); endpointsRendered = true; }
  if (name === "modules") {
    if (modulesRendered) { mgResize(); } else { renderModules(); modulesRendered = true; }
  }
  if (name === "endpoints" && endpointsRendered) epResize();
}

for (const btn of tabBtns) {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
    window.__ndTrack?.(btn.dataset.tab);
  });
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
`;
