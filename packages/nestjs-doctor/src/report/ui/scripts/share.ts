export const SHARE = `
// ── Share dialog ──
(function() {
  var btn = document.getElementById("nav-share");
  if (!btn) return;
  var SHARE = REPORT.share;

  function isNotScored(d) { return !!(d.surfaces && d.surfaces.indexOf("score") === -1); }

  /** What a section would actually export once not-scored findings are dropped. */
  function scoredCount(id) {
    if (id.indexOf("findings:") !== 0) return null;
    var slice = SHARE.findingsByCategory[id.slice(9)];
    if (!slice) return 0;
    var n = 0;
    for (var i = 0; i < slice.findings.length; i++) {
      if (!isNotScored(slice.findings[i])) n++;
    }
    for (var j = 0; j < slice.schemaIssues.length; j++) {
      if (!isNotScored(slice.schemaIssues[j])) n++;
    }
    return n;
  }

  function buildSharedJson(includeCode, picked) {
    var findings = [];
    var schemaIssues = [];
    var counts = {total: 0, errors: 0, warnings: 0, info: 0, byCategory: {security: 0, performance: 0, correctness: 0, architecture: 0, schema: 0}};
    for (var i = 0; i < picked.length; i++) {
      if (picked[i].indexOf("findings:") !== 0) continue;
      var slice = SHARE.findingsByCategory[picked[i].slice(9)];
      if (!slice) continue;
      for (var f = 0; f < slice.findings.length; f++) {
        var d = slice.findings[f];
        if (isNotScored(d)) continue;
        if (includeCode) {
          findings.push(d);
        } else {
          var copy = {};
          for (var key in d) if (key !== "sourceLines") copy[key] = d[key];
          findings.push(copy);
        }
        counts.total++;
        if (d.severity === "error") counts.errors++;
        else if (d.severity === "warning") counts.warnings++;
        else counts.info++;
        counts.byCategory[d.category]++;
      }
      for (var s = 0; s < slice.schemaIssues.length; s++) {
        var issue = slice.schemaIssues[s];
        if (isNotScored(issue)) continue;
        schemaIssues.push(issue);
        counts.total++;
        if (issue.severity === "error") counts.errors++;
        else if (issue.severity === "warning") counts.warnings++;
        else counts.info++;
        counts.byCategory[issue.category]++;
      }
    }
    function has(id) { return picked.indexOf(id) >= 0; }
    return {
      version: SHARE.version,
      generator: REPORT.generator,
      generatedAt: new Date().toISOString(),
      ...(has("score") ? {project: SHARE.project, score: SHARE.score} : {}),
      ...(SHARE.scope ? {scope: SHARE.scope} : {}),
      summary: counts,
      sections: picked,
      includeCode: includeCode && findings.length > 0,
      findings: findings,
      schemaIssues: schemaIssues,
      ...(SHARE.endpoints && has("endpoints") ? {endpoints: SHARE.endpoints} : {}),
      ...(SHARE.schema && has("schema") ? {schema: SHARE.schema} : {}),
      ...(SHARE.modules && has("modules") ? {modules: SHARE.modules} : {})
    };
  }

  btn.addEventListener("click", function() {
    var old = document.getElementById("share-overlay");
    if (old) { document.body.removeChild(old); return; }

    var overlay = document.createElement("div");
    overlay.id = "share-overlay";
    overlay.className = "share-overlay";

    var sections = SHARE.sections;
    var html = '<div id="share-panel" class="share-panel">';
    html += '<div class="share-title">Share the report</div>';
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var count = scoredCount(s.id);
      if (count === 0) continue;
      if (count === null) count = s.count;
      html += '<label class="share-row"><input type="checkbox" class="share-section" value="' + s.id + '" checked> ' + s.label + ' (' + count + ')</label>';
    }
    html += '<label class="share-row" style="margin-top:4px"><input type="checkbox" id="share-code"> Include code snippets <span class="share-hint">a few lines around each finding</span></label>';
    html += '<div class="share-actions">';
    html += RPT.textButton({ id: "share-download", classes: "share-download", type: "button", label: "Download .json", indent: 0 });
    html += '</div></div>';
    overlay.innerHTML = html;

    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });

    overlay.querySelector("#share-download").addEventListener("click", function() {
      var picked = [];
      var boxes = overlay.querySelectorAll(".share-section");
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked) picked.push(boxes[i].value);
      }
      if (picked.length === 0) return;
      var includeCode = overlay.querySelector("#share-code").checked;
      var data = buildSharedJson(includeCode, picked);
      var blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nestjs-doctor-shared.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      close();
    });

    document.body.appendChild(overlay);
  });
})();`;
