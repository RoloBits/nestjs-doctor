export const SUMMARY = `
// ── Summary Tab rendering ──
function renderSummary() {
  const container = document.getElementById("tab-summary");
  const sv = project.score.value;
  const stars = Math.round(sv / 20);

  let html = '<div class="summary-grid">';

  // Score card (full width)
  var NOT_SCORED_HELP = 'Reported only \u00b7 never counts toward the score or a build failure';
  var notScoredCount = (diagnostics || []).filter(function (d) {
    return d.surfaces && d.surfaces.indexOf('score') === -1;
  }).length;
  var scoreBody = '<div class="ov-score-row">' +
    '<div class="ov-score-ring">' + RPT.makeScoreRingSvg(120, 6, sv) + '</div>' +
    '<div class="ov-score-details">' +
    '<div class="ov-score-label">' + sv + ' / 100</div>' +
    '<div class="ov-score-sublabel">' + escHtml(project.score.label) + '</div>' +
    '<div class="ov-stars">' + "\\u2605".repeat(stars) + "\\u2606".repeat(5 - stars) + '</div>' +
    '<div class="ov-breakdown">' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-error)"></div> ' + summary.errors + ' errors</div>' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-warning)"></div> ' + summary.warnings + ' warnings</div>' +
    '<div class="ov-breakdown-item"><div class="ov-breakdown-dot" style="background:var(--sev-info)"></div> ' + summary.info + ' info</div>' +
    '</div>' +
    (notScoredCount > 0
      ? '<div class="ov-notscored">' + notScoredCount + ' of ' + (summary.total || 0) +
        ' not scored' +
        '<span class="ov-info has-tip" tabindex="0" role="img" aria-label="' + NOT_SCORED_HELP + '" data-tip="' + NOT_SCORED_HELP + '">' +
        RPT.icon({ name: "infoDot", size: 13, ariaHidden: true }) +
        '</span>' +
        '</div>'
      : '') +
    '</div></div>';
  html += RPT.card({ title: "Health Score", fullWidth: true, body: scoreBody });

  // Project info card
  html += RPT.infoCard({
    title: "Project Info",
    rows: [
      { label: "Name", value: escHtml(project.name) },
      { label: "NestJS", value: project.nestVersion || "\\u2014" },
      { label: "Framework", value: project.framework || "\\u2014" },
      { label: "ORM", value: project.orm || "\\u2014" },
      { label: "Files", value: project.fileCount },
      { label: "Modules", value: project.moduleCount }
    ]
  });

  // Category breakdown card
  var catBody = '';
  for (const cat of CAT_ORDER) {
    const m = CAT_META[cat];
    const count = (summary.byCategory && summary.byCategory[cat]) || 0;
    catBody += '<div class="ov-cat-row">' +
      '<div class="ov-cat-icon" style="background:' + m.color + '"></div>' +
      '<span class="ov-cat-name">' + m.label + '</span>' +
      '<span class="ov-cat-count">' + count + '</span></div>';
  }
  html += RPT.card({ title: "Issues by Category", body: catBody });

  // Module graph stats card
  html += RPT.statCard({
    title: "Module Graph",
    rows: [
      { label: "Total modules", value: graph.modules.length },
      { label: "Root modules", value: rootModules.size },
      { label: "Edges", value: graph.edges.length },
      { label: "Circular deps", value: graph.circularDeps.length }
    ]
  });

  // Analysis card
  html += RPT.statCard({
    title: "Analysis",
    rows: [
      { label: "Duration", value: (elapsedMs / 1000).toFixed(2) + "s" },
      { label: "Files scanned", value: project.fileCount },
      { label: "Total issues", value: summary.total }
    ]
  });

  html += '</div>';
  container.innerHTML = html;
}
`;
