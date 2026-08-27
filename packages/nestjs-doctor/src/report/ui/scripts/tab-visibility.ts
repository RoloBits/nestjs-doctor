export const TAB_VISIBILITY = `
// ── Schema tab visibility ──
if (schema.entities.length > 0) {
  document.getElementById("tab-btn-schema").style.display = "";
}

// ── Endpoints tab visibility ──
if (endpoints.endpoints.length > 0) {
  document.getElementById("tab-btn-endpoints").style.display = "";
}
`;
