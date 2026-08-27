export const SHARE = `
// ── Share dialog ──
(function() {
  var btn = document.getElementById("nav-share");
  if (!btn) return;
  var SHARE = REPORT.share;

  function isNotScored(d) { return RPT.isNotScored(d); }

  /** What a section would actually export once not-scored findings are dropped. */
  function scoredCount(id) {
    return RPT.scoredCount(SHARE, id);
  }

  function buildSharedJson(includeCode, picked) {
    return RPT.buildSharedJson(SHARE, REPORT.generator, includeCode, picked);
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
