export const DIAGNOSIS = `
// ── Diagnosis Tab rendering ──
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
const CAT_META = {
  security:     { label: "Security",     color: "var(--cat-security)" },
  correctness:  { label: "Correctness",  color: "var(--cat-correctness)" },
  schema:       { label: "Schema",       color: "var(--cat-schema)" },
  architecture: { label: "Architecture", color: "var(--cat-architecture)" },
  performance:  { label: "Performance",  color: "var(--cat-performance)" },
};
const CAT_ORDER = ["security", "correctness", "schema", "architecture", "performance"];

function renderDiagnosis() {
  const sidebarEl = document.getElementById("diagnosis-sidebar");
  const mainEl = document.getElementById("diagnosis-main");

  if (diagnostics.length === 0) {
    sidebarEl.style.display = "none";
    mainEl.style.left = "0";
    mainEl.innerHTML =
      '<div class="diagnosis-clean">' +
      RPT.icon({ name: "checkCircle", size: 48 }) +
      '<p>No issues found</p>' +
      '<span>Your project passed all checks.</span>' +
      '</div>';
    return;
  }

  // Group diagnostics by file path
  const fileMap = {};
  for (let i = 0; i < diagnostics.length; i++) {
    const d = diagnostics[i];
    const fp = d.filePath || "";
    if (!fileMap[fp]) fileMap[fp] = [];
    fileMap[fp].push({ d: d, origIdx: i });
  }
  for (const fp in fileMap) {
    fileMap[fp].sort(function(a, b) { return (a.d.line || 0) - (b.d.line || 0); });
  }

  // Build tree from file paths
  const diagSev = function(item) { return item.d.severity; };
  const treeRoot = RPT.buildFileTree(fileMap, "diags");
  RPT.compressTree(treeRoot);

  function collectSevs(diagList) {
    const sevs = {};
    for (let i = 0; i < diagList.length; i++) sevs[diagList[i].d.severity] = true;
    return Object.keys(sevs).join(",");
  }

  const ruleListEl = document.getElementById("diagnosis-rule-list");
  ruleListEl.innerHTML = renderTreeHtml(treeRoot, {
    itemsKey: "diags",
    getSeverity: diagSev,
    collectSevs: collectSevs,
  });

  // Expand state per diagnostic origIdx
  const expandState = {};
  const EXPAND_STEP = 20;
  let activeFilePath = null;
  let activeFileEl = null;

  // Show all diagnostics for a file in the main panel
  function showFile(filePath, skipHighlightScroll) {
    const diags = fileMap[filePath];
    if (!diags) return;

    // Filter by active severity and scope
    let filtered = diags.filter(function(entry) { return isDiagVisible(entry); });

    // Update active state in sidebar
    if (activeFileEl) activeFileEl.classList.remove("active");
    const fileEls = ruleListEl.querySelectorAll(".tree-file");
    for (let i = 0; i < fileEls.length; i++) {
      if (fileEls[i].dataset.path === filePath) {
        fileEls[i].classList.add("active");
        activeFileEl = fileEls[i];
        break;
      }
    }
    activeFilePath = filePath;

    const emptyState = document.getElementById("diagnosis-empty-state");
    const fileView = document.getElementById("diagnosis-file-view");
    emptyState.style.display = "none";
    fileView.style.display = "block";

    // File header
    const headerEl = document.getElementById("diagnosis-file-header");
    headerEl.innerHTML = renderFileHeader(filePath, filtered, diagSev);

    // ── Unified code viewer ──
    const codeEl = document.getElementById("diagnosis-file-code");
    codeEl.innerHTML = "";

    const fullSource = fileSources[filePath];

    // Sort filtered diagnostics by line number
    const sorted = filtered.slice().sort(function(a, b) { return (a.d.line || 0) - (b.d.line || 0); });

    // Check if any diagnostic has source lines
    let hasAnySource = false;
    for (let si = 0; si < sorted.length; si++) {
      const sl = sourceLinesData[sorted[si].origIdx];
      if (sl && sl.length > 0) { hasAnySource = true; break; }
    }

    if (!hasAnySource && !fullSource) {
      codeEl.innerHTML = isMonorepo
        ? '<div class="no-source-msg">Source code viewer is not available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package for the full code viewer.</span></div>'
        : '<div class="no-source-msg">Source code not available for project-scoped rules</div>';
    } else if (fullSource) {
      const allLines = fullSource.split("\\n");
      const totalLines = allLines.length;

      // Build segments from diagnostic source ranges
      const segments = [];
      for (let si = 0; si < sorted.length; si++) {
        const entry = sorted[si];
        // Schema diagnostics have no line — skip code segment
        if (!("line" in entry.d)) continue;
        const sl = sourceLinesData[entry.origIdx];
        let segStart, segEnd;
        if (sl && sl.length > 0) {
          segStart = sl[0].line;
          segEnd = sl[sl.length - 1].line;
        } else {
          segStart = Math.max(1, entry.d.line - 3);
          segEnd = Math.min(totalLines, entry.d.line + 3);
        }
        // Apply expand state
        if (!expandState[entry.origIdx]) expandState[entry.origIdx] = { above: 0, below: 0 };

        // Merge with previous segment if overlapping or within 3 lines
        if (segments.length > 0) {
          const prev = segments[segments.length - 1];
          if (segStart <= prev.end + 4) {
            prev.end = Math.max(prev.end, segEnd);
            prev.diagEntries.push({ line: entry.d.line, rule: entry.d.rule, message: entry.d.message, severity: entry.d.severity });
            continue;
          }
        }
        segments.push({ start: segStart, end: segEnd, diagEntries: [{ line: entry.d.line, rule: entry.d.rule, message: entry.d.message, severity: entry.d.severity }] });
      }

      // Apply global expand state for first/last segment
      if (segments.length > 0) {
        // Use global expand state keyed by filePath
        if (!expandState["__file_" + filePath]) expandState["__file_" + filePath] = { above: 0, below: 0 };
        const fileExpand = expandState["__file_" + filePath];
        segments[0].start = Math.max(1, segments[0].start - fileExpand.above);
        segments[segments.length - 1].end = Math.min(totalLines, segments[segments.length - 1].end + fileExpand.below);
      }

      // Render expand-above row
      if (segments.length > 0 && segments[0].start > 1) {
        const aboveCount = segments[0].start - 1;
        const aboveRow = document.createElement("div");
        aboveRow.className = "code-expand-row";
        aboveRow.innerHTML = SVG_UP + " Expand " + Math.min(EXPAND_STEP, aboveCount) + " lines";
        (function(fp) {
          aboveRow.addEventListener("click", function() {
            const mEl = document.getElementById("diagnosis-main");
            const scrollBefore = mEl.scrollTop;
            expandState["__file_" + fp].above += EXPAND_STEP;
            showFile(fp, true);
            mEl.scrollTop = scrollBefore;
          });
        })(filePath);
        codeEl.appendChild(aboveRow);
      }

      // Render each segment with separators between them
      for (let sg = 0; sg < segments.length; sg++) {
        if (sg > 0) {
          const gapStart = segments[sg - 1].end;
          const gapEnd = segments[sg].start;
          const hiddenCount = gapEnd - gapStart - 1;
          if (hiddenCount > 0) {
            const sepRow = document.createElement("div");
            sepRow.className = "code-separator-row";
            sepRow.textContent = "\\u22EF " + hiddenCount + " line" + (hiddenCount !== 1 ? "s" : "") + " hidden";
            codeEl.appendChild(sepRow);
          }
        }

        const seg = segments[sg];
        const snippetLines = allLines.slice(seg.start - 1, seg.end);
        const codeText = snippetLines.join("\\n");
        const firstLineNum = seg.start;

        // Compute highlight lines and line metadata relative to this segment
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < seg.diagEntries.length; hi++) {
          const de = seg.diagEntries[hi];
          const relLine = de.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= snippetLines.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: de.rule, message: de.message, severity: de.severity });
          }
        }

        const wrapDiv = document.createElement("div");
        codeEl.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
            skipScrollIntoView: sg > 0 || !!skipHighlightScroll,
          });
        }
      }

      // Render expand-below row
      if (segments.length > 0 && segments[segments.length - 1].end < totalLines) {
        const belowCount = totalLines - segments[segments.length - 1].end;
        const belowRow = document.createElement("div");
        belowRow.className = "code-expand-row code-expand-below";
        belowRow.innerHTML = SVG_DOWN + " Expand " + Math.min(EXPAND_STEP, belowCount) + " lines";
        (function(fp) {
          belowRow.addEventListener("click", function() {
            expandState["__file_" + fp].below += EXPAND_STEP;
            showFile(fp, true);
            pinExpandBelow(document.getElementById("diagnosis-file-code"));
          });
        })(filePath);
        codeEl.appendChild(belowRow);
      }
    } else {
      // No fullSource but has sourceLines — render from snippet data
      const firstWithSource = sorted.find(function(entry) {
        const lines = sourceLinesData[entry.origIdx];
        return lines && lines.length > 0;
      });
      const sl = firstWithSource ? sourceLinesData[firstWithSource.origIdx] : null;
      if (sl && sl.length > 0) {
        const codeText = sl.map(function(s) { return s.text; }).join("\\n");
        const firstLineNum = sl[0].line;
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < sorted.length; hi++) {
          const de = sorted[hi].d;
          if (!("line" in de)) continue;
          const relLine = de.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= sl.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: de.rule, message: de.message, severity: de.severity });
          }
        }
        const wrapDiv = document.createElement("div");
        codeEl.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
          });
        }
      }
    }

    // ── Stacked diagnostic info items below code ──
    const infoEl = document.getElementById("diagnosis-file-info");
    infoEl.innerHTML = "";

    // Group diagnostics by rule (preserving order of first occurrence)
    const ruleGroups = [];
    const ruleGroupMap = {};
    for (let j = 0; j < sorted.length; j++) {
      const entry = sorted[j];
      const rule = entry.d.rule;
      // Keyed with the help text.
      const key = rule + "\u0000" + (entry.d.help || "");
      if (!ruleGroupMap[key]) {
        ruleGroupMap[key] = { rule: rule, entries: [] };
        ruleGroups.push(ruleGroupMap[key]);
      }
      ruleGroupMap[key].entries.push(entry);
    }

    for (let g = 0; g < ruleGroups.length; g++) {
      const group = ruleGroups[g];
      const item = document.createElement("div");
      item.className = "diag-info-item";

      // Render each diagnostic's header + message
      let innerHtml = "";
      let helpText = null;
      for (let k = 0; k < group.entries.length; k++) {
        const d = group.entries[k].d;
        const sevColor = d.severity === "error" ? "var(--sev-error)"
          : d.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";
        var locationLabel = ("line" in d)
          ? '<span class="diag-linecol">Ln ' + d.line + ', Col ' + d.column + '</span>'
          : (d.entity ? '<span class="diag-linecol">' + escHtml(d.entity) + (d.schemaColumn ? '.' + escHtml(d.schemaColumn) : '') + '</span>' : '');
        innerHtml +=
          '<div class="diag-info-header">' +
            '<div class="sev-dot" style="background:' + sevColor + '"></div>' +
            '<span class="code-sev-badge ' + d.severity + '">' + d.severity + '</span>' +
            '<span class="code-rule-badge">' + escHtml(d.rule) + '</span>' +
            (d.surfaces && d.surfaces.indexOf('score') === -1
              ? '<span class="code-notscored-badge" title="Reported only. Counts toward neither the score nor --blocking.">not scored</span>'
              : '') +
            locationLabel +
          '</div>' +
          '<div class="diag-info-msg">' + escHtml(d.message) + '</div>';
        if (!helpText && d.help) helpText = d.help;
      }
      item.innerHTML = innerHtml;

      // Help text — once per group
      if (helpText) {
        const helpDiv = document.createElement("div");
        helpDiv.className = "diag-info-help";
        helpDiv.innerHTML = '<div class="section-label">Recommendation</div>' + escHtml(helpText);
        item.appendChild(helpDiv);
      }

      // Examples — once per group
      const ex = ruleExamples[group.rule];
      if (ex) {
        const exDiv = document.createElement("div");
        exDiv.className = "diag-info-examples";
        exDiv.innerHTML =
          '<div class="section-label">Examples</div>' +
          '<div class="examples-group">' +
            '<div class="example-block bad"><div class="example-tag bad">Bad</div><div class="example-code"></div></div>' +
            '<div class="example-block good"><div class="example-tag good">Good</div><div class="example-code"></div></div>' +
          '</div>';
        if (window.createCodeViewer) {
          window.createCodeViewer(exDiv.querySelector(".example-block.bad .example-code"), ex.bad, { lineNumbers: false });
          window.createCodeViewer(exDiv.querySelector(".example-block.good .example-code"), ex.good, { lineNumbers: false });
        }
        item.appendChild(exDiv);
      }

      infoEl.appendChild(item);
    }

    // Scroll main panel to top
    mainEl.scrollTop = 0;
  }

  // Delegated click handler for tree headers
  ruleListEl.addEventListener("click", function(e) {
    const folderH = e.target.closest(".tree-folder-header");
    if (folderH) { folderH.parentElement.classList.toggle("collapsed"); return; }
    const fileH = e.target.closest(".tree-file-header");
    if (fileH) {
      const fileEl = fileH.parentElement;
      const path = fileEl.dataset.path;
      if (path) showFile(path);
    }
  });

  // Collapse-all toggle
  function diagSetAllFolders(collapsed) {
    const folders = ruleListEl.querySelectorAll(".tree-folder");
    for (let i = 0; i < folders.length; i++) {
      folders[i].classList.toggle("collapsed", collapsed);
    }
  }
  const expandAllBtn = document.getElementById("diag-expand-all");
  const collapseAllBtn = document.getElementById("diag-collapse-all");
  if (expandAllBtn) expandAllBtn.addEventListener("click", function() { diagSetAllFolders(false); });
  if (collapseAllBtn) collapseAllBtn.addEventListener("click", function() { diagSetAllFolders(true); });

  // Search filter
  let diagSearchQuery = "";

  // Severity filter
  let activeSev = "all";
  const pills = sidebarEl.querySelectorAll(".sev-pill");

  // Scope filter
  let activeScope = "all";
  const scopePills = sidebarEl.querySelectorAll(".scope-pill");

  // Category filter
  let activeCat = "all";
  const catPills = sidebarEl.querySelectorAll(".cat-pill");

  let showNotScored = false;
  const notScoredToggle = document.getElementById("diag-show-notscored");

  const isNotScored = diagIsNotScored;

  function isDiagVisible(entry) {
    if (!showNotScored && isNotScored(entry.d)) return false;
    if (activeSev !== "all" && entry.d.severity !== activeSev) return false;
    if (activeScope !== "all" && entry.d.scope !== activeScope) return false;
    if (activeCat !== "all" && entry.d.category !== activeCat) return false;
    return true;
  }

  function updateFiltersBadge() {
    const badge = document.getElementById("diag-filters-count");
    if (!badge) return;
    let n = 0;
    if (activeSev !== "all") n++;
    if (activeScope !== "all") n++;
    if (activeCat !== "all") n++;
    badge.textContent = n;
    badge.style.display = n > 0 ? "" : "none";
  }

  function countFileVisibleDiags(filePath) {
    const diags = fileMap[filePath];
    if (!diags) return 0;
    let count = 0;
    for (let i = 0; i < diags.length; i++) {
      if (isDiagVisible(diags[i])) count++;
    }
    return count;
  }

  function diagMatchesSearch(filePath) {
    return diagSearchQuery === "" || filePath.toLowerCase().indexOf(diagSearchQuery) >= 0;
  }

  function updateTreeVisibility() {
    const countEl = document.getElementById("diag-file-count");
    if (countEl) {
      let shownFiles = 0;
      for (const fp in fileMap) {
        if (countFileVisibleDiags(fp) > 0 && diagMatchesSearch(fp)) shownFiles++;
      }
      countEl.textContent = shownFiles;
    }
    // 1. File nodes — hide if 0 matching diags, update count + severity icon
    const fileNodes = ruleListEl.querySelectorAll(".tree-file");
    for (let f = 0; f < fileNodes.length; f++) {
      const fPath = fileNodes[f].dataset.path;
      const visCount = countFileVisibleDiags(fPath);
      fileNodes[f].classList.toggle("hidden", visCount === 0 || !diagMatchesSearch(fPath));
      const fc = fileNodes[f].querySelector(".tree-count");
      if (fc) fc.textContent = visCount;
      // Update severity indicator
      const fIcon = fileNodes[f].querySelector(".tree-file-icon");
      if (fIcon) {
        fIcon.classList.remove("sev-indicator-error", "sev-indicator-warning", "sev-indicator-info");
        if (visCount > 0) {
          const fDiags = fileMap[fPath];
          let fWorst = "info";
          for (let vi = 0; vi < fDiags.length; vi++) {
            if (!isDiagVisible(fDiags[vi])) continue;
            const vs = fDiags[vi].d.severity;
            if (vs === "error") { fWorst = "error"; break; }
            if (vs === "warning") fWorst = "warning";
          }
          fIcon.classList.add("sev-indicator-" + fWorst);
        }
      }
    }
    // 2. Folder nodes — process in reverse DOM order (deepest first)
    const folderNodes = ruleListEl.querySelectorAll(".tree-folder");
    for (let g = folderNodes.length - 1; g >= 0; g--) {
      const folder = folderNodes[g];
      const body = folder.querySelector(".tree-folder-body");
      const visChildren = body.querySelectorAll(":scope > .tree-file:not(.hidden), :scope > .tree-folder:not(.hidden)");
      folder.classList.toggle("hidden", visChildren.length === 0);
      if (diagSearchQuery !== "" && visChildren.length > 0) folder.classList.remove("collapsed");
      // Count visible diags in all descendant files
      const descendantFiles = folder.querySelectorAll(".tree-file:not(.hidden)");
      let totalCount = 0;
      for (let df = 0; df < descendantFiles.length; df++) {
        totalCount += countFileVisibleDiags(descendantFiles[df].dataset.path);
      }
      const gc = folder.querySelector(":scope > .tree-folder-header .tree-count");
      if (gc) gc.textContent = totalCount;
      // Update severity indicator
      const gIcon = folder.querySelector(":scope > .tree-folder-header .tree-folder-icon");
      if (gIcon) {
        gIcon.classList.remove("sev-indicator-error", "sev-indicator-warning", "sev-indicator-info");
        if (totalCount > 0) {
          let gWorst = "info";
          for (let di = 0; di < descendantFiles.length; di++) {
            const dDiags = fileMap[descendantFiles[di].dataset.path];
            if (!dDiags) continue;
            for (let ai = 0; ai < dDiags.length; ai++) {
              if (!isDiagVisible(dDiags[ai])) continue;
              const as = dDiags[ai].d.severity;
              if (as === "error") { gWorst = "error"; break; }
              if (as === "warning") gWorst = "warning";
            }
            if (gWorst === "error") break;
          }
          gIcon.classList.add("sev-indicator-" + gWorst);
        }
      }
    }
    // 3. If current file is hidden, clear main panel
    if (activeFileEl && activeFileEl.classList.contains("hidden")) {
      activeFileEl.classList.remove("active");
      activeFileEl = null;
      activeFilePath = null;
      document.getElementById("diagnosis-empty-state").style.display = "flex";
      document.getElementById("diagnosis-file-view").style.display = "none";
    } else if (activeFilePath) {
      // Re-render main panel with filtered diagnostics
      showFile(activeFilePath);
    }
  }
  const pillGroups = [
    { pills: pills, key: "sev", set: function(v) { activeSev = v; } },
    { pills: scopePills, key: "scope", set: function(v) { activeScope = v; } },
    { pills: catPills, key: "cat", set: function(v) { activeCat = v; } },
  ];
  for (const group of pillGroups) {
    for (let pi = 0; pi < group.pills.length; pi++) {
      group.pills[pi].addEventListener("click", function() {
        group.set(this.dataset[group.key]);
        for (let pp = 0; pp < group.pills.length; pp++) {
          group.pills[pp].classList.toggle("active", group.pills[pp] === this);
        }
        updateFiltersBadge();
        updateTreeVisibility();
      });
    }
  }
  const filtersToggle = document.getElementById("diag-filters-toggle");
  if (filtersToggle) {
    filtersToggle.addEventListener("click", function() {
      const open = sidebarEl.querySelector(".diagnosis-toolbar").classList.toggle("filters-open");
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  const diagSearchEl = document.getElementById("diag-search");
  if (diagSearchEl) {
    diagSearchEl.addEventListener("input", function() {
      diagSearchQuery = this.value.trim().toLowerCase();
      updateTreeVisibility();
    });
  }

  if (notScoredToggle) {
    // The row is pointless when nothing is filtered by it.
    const anyNotScored = diagnostics.some(isNotScored);
    const hideable = ["diag-notscored-row", "diag-notscored-divider"];
    for (let hi = 0; hi < hideable.length; hi++) {
      const el = document.getElementById(hideable[hi]);
      if (el) el.style.display = anyNotScored ? "" : "none";
    }
    showNotScored = notScoredToggle.checked;
    setDiagnosisBadge(showNotScored);
    notScoredToggle.addEventListener("change", function() {
      showNotScored = this.checked;
      setDiagnosisBadge(showNotScored);
      updateTreeVisibility();
    });
  }
  updateTreeVisibility();
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
`;
