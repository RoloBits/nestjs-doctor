export const CHROME = `
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
