export const LAB = `
// ── Lab Tab rendering ──
function renderLab() {
  const PLAYGROUND_PRESETS = {
    "todo": {
      ruleId: "no-todo-comments",
      category: "correctness",
      severity: "warning",
      scope: "file",
      description: "Flags TODO comments left in source code",
      code: '// Find TODO/FIXME comments...\\nconst lines = context.fileText.split("\\\\n");\\nfor (let i = 0; i < lines.length; i++) {\\n  if (/\\\\/\\\\/\\\\s*(TODO|FIXME)/.test(lines[i])) {\\n    context.report({\\n      message: "Found TODO/FIXME comment: " + lines[i].trim(),\\n      line: i + 1,\\n    });\\n  }\\n}'
    },
    "console-log": {
      ruleId: "no-console-log",
      category: "correctness",
      severity: "warning",
      scope: "file",
      description: "Flags console.log statements left in source code",
      code: '// Find console.log() calls...\\nconst lines = context.fileText.split("\\\\n");\\nfor (let i = 0; i < lines.length; i++) {\\n  if (/console\\\\.(log|debug|warn|error)\\\\s*\\\\(/.test(lines[i])) {\\n    const match = lines[i].match(/console\\\\.(log|debug|warn|error)/);\\n    context.report({\\n      message: "Found console." + match[1] + "() call",\\n      line: i + 1,\\n    });\\n  }\\n}'
    },
    "large-file": {
      ruleId: "no-large-files",
      category: "architecture",
      severity: "info",
      scope: "file",
      description: "Flags files exceeding 300 lines",
      code: '// Flag files that are too long\\nconst lines = context.fileText.split("\\\\n");\\nconst MAX_LINES = 300;\\nif (lines.length > MAX_LINES) {\\n  context.report({\\n    message: "File has " + lines.length + " lines (max " + MAX_LINES + ")",\\n    line: 1,\\n  });\\n}'
    },
    "orphan-modules": {
      ruleId: "find-orphan-modules",
      category: "architecture",
      severity: "info",
      scope: "project",
      description: "Finds modules never imported by another module",
      code: '// Find modules that are never imported...\\nvar imported = new Set();\\nfor (var i = 0; i < context.modules.length; i++) {\\n  var mod = context.modules[i];\\n  for (var j = 0; j < mod.imports.length; j++) {\\n    imported.add(mod.imports[j]);\\n  }\\n}\\nfor (var i = 0; i < context.modules.length; i++) {\\n  var mod = context.modules[i];\\n  if (mod.name !== "AppModule" && !imported.has(mod.name)) {\\n    context.report({\\n      message: "Module \\'" + mod.name + "\\' is never imported",\\n      filePath: mod.filePath,\\n      line: 1,\\n    });\\n  }\\n}'
    },
    "unused-providers": {
      ruleId: "find-unused-providers",
      category: "performance",
      severity: "warning",
      scope: "project",
      description: "Finds providers never injected anywhere",
      code: '// Find providers not used as dependencies...\\nvar allDeps = new Set();\\nfor (var i = 0; i < context.providers.length; i++) {\\n  var p = context.providers[i];\\n  for (var j = 0; j < p.dependencies.length; j++) {\\n    allDeps.add(p.dependencies[j]);\\n  }\\n}\\nfor (var i = 0; i < context.providers.length; i++) {\\n  var p = context.providers[i];\\n  if (!allDeps.has(p.name)) {\\n    context.report({\\n      message: "Provider \\'" + p.name + "\\' is never injected",\\n      filePath: p.filePath,\\n      line: 1,\\n    });\\n  }\\n}'
    },
  };

  const presetSelect = document.getElementById("pg-preset");
  function loadPreset(key) {
    const p = PLAYGROUND_PRESETS[key];
    if (!p) return;
    document.getElementById("pg-rule-id").value = p.ruleId;
    document.getElementById("pg-category").value = p.category;
    document.getElementById("pg-severity").value = p.severity;
    document.getElementById("pg-scope").value = p.scope || "file";
    document.getElementById("pg-description").value = p.description;
    updateContextHint();
    if (window.cmEditor) {
      window.cmEditor.dispatch({
        changes: { from: 0, to: window.cmEditor.state.doc.length, insert: p.code }
      });
    }
  }
  presetSelect.addEventListener("change", function() { window.__ndTrack?.("rule_lab_preset_loaded"); loadPreset(this.value); });

  let pgMetaTracked = false;
  for (const id of ["pg-severity", "pg-category"]) {
    document.getElementById(id)?.addEventListener("change", function() {
      if (pgMetaTracked) return;
      pgMetaTracked = true;
      window.__ndTrack?.("rule_lab_metadata_changed");
    });
  }

  function updateContextHint() {
    const hint = document.getElementById("pg-context-hint");
    const scope = document.getElementById("pg-scope").value;
    if (scope === "project") {
      hint.textContent = "context.files · context.fileSources · context.modules · context.edges · context.circularDeps · context.providers · context.report({ message, filePath, line })";
    } else {
      hint.textContent = "context.fileText · context.filePath · context.report({ message, line })";
    }
  }

  document.getElementById("pg-scope").addEventListener("change", function() {
    window.__ndTrack?.("rule_lab_scope_changed");
    updateContextHint();
    filterPresetsByScope();
  });

  function filterPresetsByScope() {
    const scope = document.getElementById("pg-scope").value;
    const options = presetSelect.querySelectorAll("option");
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const preset = PLAYGROUND_PRESETS[opt.value];
      if (preset) {
        opt.style.display = preset.scope === scope ? "" : "none";
      }
    }
    const optgroups = presetSelect.querySelectorAll("optgroup");
    for (let i = 0; i < optgroups.length; i++) {
      const group = optgroups[i];
      const visibleChildren = group.querySelectorAll("option");
      let hasVisible = false;
      for (let j = 0; j < visibleChildren.length; j++) {
        if (visibleChildren[j].style.display !== "none") { hasVisible = true; break; }
      }
      group.style.display = hasVisible ? "" : "none";
    }
    const currentPreset = PLAYGROUND_PRESETS[presetSelect.value];
    if (currentPreset && currentPreset.scope !== scope) {
      for (let i = 0; i < options.length; i++) {
        const preset = PLAYGROUND_PRESETS[options[i].value];
        if (preset && preset.scope === scope) {
          presetSelect.value = options[i].value;
          loadPreset(options[i].value);
          break;
        }
      }
    }
  }

  loadPreset(presetSelect.value);

  const runBtn = document.getElementById("pg-run-btn");
  runBtn?.addEventListener("click", function() { window.__ndTrack?.("rule_lab_run"); });
  const errorEl = document.getElementById("pg-error");
  const resultList = document.getElementById("pg-result-list");
  const resultCount = document.getElementById("pg-result-count");
  const resultEmpty = document.getElementById("pg-result-empty");
  const pgFileView = document.getElementById("pg-file-view");
  const pgFileHeader = document.getElementById("pg-file-header");
  const pgFileCode = document.getElementById("pg-file-code");

  let activeResultEl = null;
  let pgExpandState = {};
  const PG_EXPAND_STEP = 20;
  let currentPgFileMap = {};
  let activePgFilePath = null;

  // Delegated click handler — registered once, outside runBtn
  resultList.addEventListener("click", function(e) {
    const folderH = e.target.closest(".tree-folder-header");
    if (folderH) { folderH.parentElement.classList.toggle("collapsed"); return; }
    const fileH = e.target.closest(".tree-file-header");
    if (fileH) {
      const fileEl = fileH.parentElement;
      const path = fileEl.dataset.path;
      if (path) { window.__ndTrack?.("rule_lab_result_opened"); showPgFile(path); }
      return;
    }
    const standalone = e.target.closest(".pg-standalone-item");
    if (standalone) {
      const idx = Number(standalone.dataset.idx);
      const items = currentPgFileMap[""] || [];
      const entry = items[idx];
      if (!entry) return;
      if (activeResultEl) activeResultEl.classList.remove("active");
      standalone.classList.add("active");
      activeResultEl = standalone;
      pgFileView.style.display = "none";
      return;
    }
  });


  function showPgFile(filePath, skipHighlightScroll) {
    const findings = currentPgFileMap[filePath];
    if (!findings) return;

    // Update active state in tree
    if (activeResultEl) activeResultEl.classList.remove("active");
    const fileEls = resultList.querySelectorAll(".tree-file");
    for (let i = 0; i < fileEls.length; i++) {
      if (fileEls[i].dataset.path === filePath) {
        fileEls[i].classList.add("active");
        activeResultEl = fileEls[i];
        break;
      }
    }
    activePgFilePath = filePath;

    // File header
    const labSev = function(item) { return item.res.severity; };
    pgFileHeader.innerHTML = renderFileHeader(filePath, findings, labSev);

    // Unified code viewer
    pgFileCode.innerHTML = "";
    const fullSource = fileSources[filePath];
    if (!fullSource) {
      pgFileCode.innerHTML = isMonorepo
        ? '<div class="no-source-msg">Source code viewer is not available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package for the full code viewer.</span></div>'
        : '<div class="no-source-msg">Source code not available</div>';
    } else {
      // Sort findings by line
      const sorted = findings.slice().sort(function(a, b) { return a.res.line - b.res.line; });
      const allLines = fullSource.split("\\n");
      const totalLines = allLines.length;

      // Build segments (merge nearby findings within 4 lines)
      const segments = [];
      for (let si = 0; si < sorted.length; si++) {
        const entry = sorted[si];
        const segStart = Math.max(1, entry.res.line - 3);
        const segEnd = Math.min(totalLines, entry.res.line + 3);
        if (segments.length > 0) {
          const prev = segments[segments.length - 1];
          if (segStart <= prev.end + 4) {
            prev.end = Math.max(prev.end, segEnd);
            prev.entries.push(entry);
            continue;
          }
        }
        segments.push({ start: segStart, end: segEnd, entries: [entry] });
      }

      // Apply expand state
      if (!pgExpandState[filePath]) pgExpandState[filePath] = { above: 0, below: 0 };
      const fileExp = pgExpandState[filePath];
      if (segments.length > 0) {
        segments[0].start = Math.max(1, segments[0].start - fileExp.above);
        segments[segments.length - 1].end = Math.min(totalLines, segments[segments.length - 1].end + fileExp.below);
      }

      // Expand above
      if (segments.length > 0 && segments[0].start > 1) {
        const aboveCount = segments[0].start - 1;
        const aboveRow = document.createElement("div");
        aboveRow.className = "code-expand-row";
        aboveRow.innerHTML = SVG_UP + " Expand " + Math.min(PG_EXPAND_STEP, aboveCount) + " lines";
        (function(fp) {
          aboveRow.addEventListener("click", function() {
            const paneEl = document.querySelector(".playground-results");
            const scrollBefore = paneEl.scrollTop;
            pgExpandState[fp].above += PG_EXPAND_STEP;
            showPgFile(fp, true);
            paneEl.scrollTop = scrollBefore;
          });
        })(filePath);
        pgFileCode.appendChild(aboveRow);
      }

      // Render segments with separators
      for (let sg = 0; sg < segments.length; sg++) {
        if (sg > 0) {
          const gapStart = segments[sg - 1].end;
          const gapEnd = segments[sg].start;
          const hiddenCount = gapEnd - gapStart - 1;
          if (hiddenCount > 0) {
            const sepRow = document.createElement("div");
            sepRow.className = "code-separator-row";
            sepRow.textContent = "\\u22EF " + hiddenCount + " line" + (hiddenCount !== 1 ? "s" : "") + " hidden";
            pgFileCode.appendChild(sepRow);
          }
        }
        const seg = segments[sg];
        const snippetLines = allLines.slice(seg.start - 1, seg.end);
        const codeText = snippetLines.join("\\n");
        const firstLineNum = seg.start;
        const hlLines = [];
        const lineMetadata = {};
        for (let hi = 0; hi < seg.entries.length; hi++) {
          const e = seg.entries[hi];
          const relLine = e.res.line - firstLineNum + 1;
          if (relLine >= 1 && relLine <= snippetLines.length) {
            hlLines.push(relLine);
            if (!lineMetadata[relLine]) lineMetadata[relLine] = [];
            lineMetadata[relLine].push({ rule: e.res.ruleId, message: e.res.message, severity: e.res.severity });
          }
        }
        const wrapDiv = document.createElement("div");
        pgFileCode.appendChild(wrapDiv);
        if (window.createCodeViewer) {
          window.createCodeViewer(wrapDiv, codeText, {
            highlightLines: hlLines,
            lineMetadata: lineMetadata,
            firstLineNumber: firstLineNum,
            skipScrollIntoView: sg > 0 || !!skipHighlightScroll,
          });
        }
      }

      // Expand below
      if (segments.length > 0 && segments[segments.length - 1].end < totalLines) {
        const belowCount = totalLines - segments[segments.length - 1].end;
        const belowRow = document.createElement("div");
        belowRow.className = "code-expand-row code-expand-below";
        belowRow.innerHTML = SVG_DOWN + " Expand " + Math.min(PG_EXPAND_STEP, belowCount) + " lines";
        (function(fp) {
          belowRow.addEventListener("click", function() {
            pgExpandState[fp].below += PG_EXPAND_STEP;
            showPgFile(fp, true);
            pinExpandBelow(pgFileCode);
          });
        })(filePath);
        pgFileCode.appendChild(belowRow);
      }
    }

    pgFileView.style.display = "block";
  }

  runBtn.addEventListener("click", function() {
    errorEl.style.display = "none";
    resultList.innerHTML = "";
    pgFileView.style.display = "none";
    activeResultEl = null;
    pgExpandState = {};

    if (!window.cmEditor) {
      errorEl.textContent = "Editor not loaded — check your internet connection.";
      errorEl.style.display = "block";
      resultCount.textContent = "";
      resultEmpty.style.display = "flex";
      return;
    }
    const userCode = window.cmEditor.state.doc.toString();
    const ruleId = document.getElementById("pg-rule-id").value || "my-rule";
    const category = document.getElementById("pg-category").value;
    const severity = document.getElementById("pg-severity").value;
    const scope = document.getElementById("pg-scope").value;

    let checkFn;
    try {
      checkFn = new Function("context", userCode);
    } catch (err) {
      errorEl.textContent = "Syntax error: " + err.message;
      errorEl.style.display = "block";
      resultCount.textContent = "";
      resultEmpty.style.display = "flex";
      return;
    }

    let results = [];

    if (scope === "project") {
      const projectResults = [];
      const projectCtx = {
        files: Object.keys(fileSources),
        fileSources: fileSources,
        modules: graph.modules,
        edges: graph.edges,
        circularDeps: graph.circularDeps,
        providers: providers,
        report: function(finding) {
          projectResults.push({
            message: finding.message || "No message",
            line: finding.line || 1,
            filePath: finding.filePath || "",
            ruleId: ruleId,
            category: category,
            severity: severity,
          });
        },
      };
      try {
        checkFn(projectCtx);
      } catch (err) {
        projectResults.push({
          message: "Runtime error: " + err.message,
          line: 1,
          filePath: "",
          ruleId: ruleId,
          category: category,
          severity: "error",
          isError: true,
        });
      }
      results = projectResults;
    } else {
      const fileEntries = Object.entries(fileSources);
      for (let fi = 0; fi < fileEntries.length; fi++) {
        const filePath = fileEntries[fi][0];
        const fileText = fileEntries[fi][1];
        const fileResults = [];
        const ctx = {
          fileText: fileText,
          filePath: filePath,
          report: function(finding) {
            fileResults.push({
              message: finding.message || "No message",
              line: finding.line || 1,
              filePath: filePath,
              ruleId: ruleId,
              category: category,
              severity: severity,
            });
          },
        };
        try {
          checkFn(ctx);
        } catch (err) {
          fileResults.push({
            message: "Runtime error: " + err.message,
            line: 1,
            filePath: filePath,
            ruleId: ruleId,
            category: category,
            severity: "error",
            isError: true,
          });
        }
        for (let r = 0; r < fileResults.length; r++) results.push(fileResults[r]);
      }
    }

    // Sort by file path then line
    results.sort(function(a, b) {
      if (a.filePath < b.filePath) return -1;
      if (a.filePath > b.filePath) return 1;
      return a.line - b.line;
    });

    resultCount.textContent = "(" + results.length + " finding" + (results.length !== 1 ? "s" : "") + ")";

    if (results.length === 0) {
      if (isMonorepo && scope === "file") {
        resultEmpty.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>No source files available in monorepo reports.<br><span style="opacity:0.7;font-size:0.92em">Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a single package to use the Lab with file rules.</span></p>';
      } else {
        resultEmpty.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><p>Write a check function and click Run</p>';
      }
      resultEmpty.style.display = "flex";
      return;
    }
    resultEmpty.style.display = "none";

    currentPgFileMap = {};

    const sevColors = { error: "var(--sev-error)", warning: "var(--sev-warning)", info: "var(--sev-info)" };
    const labSev = function(item) { return item.res.severity; };

    // Group results by filePath, keeping original index
    const standaloneItems = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.filePath) { standaloneItems.push({ res: r, idx: i }); continue; }
      if (!currentPgFileMap[r.filePath]) currentPgFileMap[r.filePath] = [];
      currentPgFileMap[r.filePath].push({ res: r, idx: i });
    }
    currentPgFileMap[""] = standaloneItems;

    // Build tree from file paths
    const pgTreeRoot = buildFileTree(currentPgFileMap, "findings");
    compressTree(pgTreeRoot);

    // Render tree HTML
    let pgTreeHtml = "";

    // Render standalone items (no filePath) at top
    for (let si = 0; si < standaloneItems.length; si++) {
      const st = standaloneItems[si];
      const sc = sevColors[st.res.severity] || sevColors.warning;
      pgTreeHtml += '<div class="pg-standalone-item" data-idx="' + si + '" style="padding-left:14px">' +
        '<div class="sev-dot" style="background:' + sc + '"></div>' +
        '<span class="finding-msg">' + escHtml(st.res.message) + '</span>' +
        '</div>';
    }

    pgTreeHtml += renderTreeHtml(pgTreeRoot, {
      itemsKey: "findings",
      getSeverity: labSev,
    });
    resultList.innerHTML = pgTreeHtml;

    // Auto-select first file or standalone item
    if (results.length > 0) {
      const firstFile = resultList.querySelector(".tree-file");
      if (firstFile) {
        showPgFile(firstFile.dataset.path);
      } else {
        const firstStandalone = resultList.querySelector(".pg-standalone-item");
        if (firstStandalone) {
          firstStandalone.classList.add("active");
          activeResultEl = firstStandalone;
        }
      }
    }
  });
}
`;
