export const SHARED_TREE = `
function escHtml(s) {
  return RPT.escapeHtml(s);
}

// ── Shared SVG icons ──
const SVG_FOLDER = RPT.icon({ name: "folder", size: 14 });
const SVG_FILE = RPT.icon({ name: "file", size: 14 });
const SVG_UP = RPT.icon({ name: "caretUp", size: 12 });
const SVG_DOWN = RPT.icon({ name: "caretDown", size: 12 });

// ── Shared tree helpers ──
function renderTreeHtml(root, config) {
  let html = "";
  function renderNode(n, depth) {
    const dirs = Object.keys(n.children).sort();
    const files = Object.keys(n.files).sort();
    const pad = (depth * 12) + "px";

    for (let i = 0; i < dirs.length; i++) {
      const child = n.children[dirs[i]];
      const folderSev = RPT.worstSevNode(child, config.itemsKey, config.getSeverity);
      const folderCount = RPT.countItems(child, config.itemsKey);
      html += '<div class="tree-folder">' +
        '<div class="tree-folder-header" style="padding-left:calc(14px + ' + pad + ');--guides:' + (depth * 12) + 'px">' +
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
      const fileSev = RPT.worstSev(fileNode[config.itemsKey], config.getSeverity);
      const fileCount = fileNode[config.itemsKey].length;
      let extraAttrs = "";
      if (config.collectSevs) extraAttrs = ' data-sevs="' + config.collectSevs(fileNode[config.itemsKey]) + '"';
      html += '<div class="tree-file" data-path="' + escHtml(fileNode.fullPath) + '"' + extraAttrs + '>' +
        '<div class="tree-file-header" style="padding-left:calc(14px + ' + pad + ');--guides:' + (depth * 12) + 'px">' +
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

/** Keeps the below expander at the viewport bottom while the editors grow. */
function pinExpandBelow(containerEl) {
  const anchor = containerEl.querySelector(".code-expand-below") || containerEl;
  anchor.scrollIntoView({ block: "end" });
  const ro = new ResizeObserver(function() {
    anchor.scrollIntoView({ block: "end" });
  });
  ro.observe(anchor.parentElement);
  setTimeout(function() { ro.disconnect(); }, 1000);
}
`;
