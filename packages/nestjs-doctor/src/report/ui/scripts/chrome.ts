export const CHROME = `
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

// ── Tab switching ──
let diagnosisRendered = false;
let labOpened = false;
let summaryRendered = false;
let schemaRendered = false;
let endpointsRendered = false;
let modulesRendered = false;

const tabContents = {
  modules: document.getElementById("tab-modules"),
  diagnosis: document.getElementById("tab-diagnosis"),
  summary: document.getElementById("tab-summary"),
  lab: document.getElementById("tab-lab"),
  schema: document.getElementById("tab-schema"),
  endpoints: document.getElementById("tab-endpoints"),
};

function switchTab(name) {
  REPORT_APP.setActiveTab(name);
  for (const [k, el] of Object.entries(tabContents)) {
    el.classList.toggle("active", k === name);
  }

  if (name === "diagnosis" && !diagnosisRendered) { REPORT_APP.renderDiagnosis(REPORT, { setDiagnosisBadge: REPORT_APP.setDiagnosisBadge }); diagnosisRendered = true; }
  if (name === "summary" && !summaryRendered) { REPORT_APP.renderSummary(REPORT); summaryRendered = true; }
  if (name === "lab" && !labOpened) { REPORT_APP.labOpened(); labOpened = true; }
  if (name === "schema" && !schemaRendered) { REPORT_APP.renderSchema(REPORT); schemaRendered = true; }
  if (name === "endpoints" && !endpointsRendered) { REPORT_APP.renderEndpoints(REPORT); endpointsRendered = true; }
  if (name === "modules") {
    if (modulesRendered) { REPORT_APP.resizeModules(); } else { REPORT_APP.renderModules(REPORT); modulesRendered = true; }
  }
  if (name === "endpoints" && endpointsRendered) REPORT_APP.resizeEndpoints();
}
`;
