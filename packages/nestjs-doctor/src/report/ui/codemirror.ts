export function getCodeMirrorImportMap(): string {
	return `<script type="importmap">
{
  "imports": {
    "style-mod": "https://esm.sh/style-mod@4.1.2",
    "w3c-keyname": "https://esm.sh/w3c-keyname@2.2.8",
    "crelt": "https://esm.sh/crelt@1.0.6",
    "@marijn/find-cluster-break": "https://esm.sh/@marijn/find-cluster-break@1.0.2",
    "@lezer/common": "https://esm.sh/*@lezer/common@1.2.3",
    "@lezer/highlight": "https://esm.sh/*@lezer/highlight@1.2.1",
    "@lezer/javascript": "https://esm.sh/*@lezer/javascript@1.4.21",
    "@lezer/lr": "https://esm.sh/*@lezer/lr@1.4.2",
    "@codemirror/autocomplete": "https://esm.sh/*@codemirror/autocomplete@6.18.4",
    "@codemirror/commands": "https://esm.sh/*@codemirror/commands@6.7.1",
    "@codemirror/language": "https://esm.sh/*@codemirror/language@6.10.8",
    "@codemirror/lang-javascript": "https://esm.sh/*@codemirror/lang-javascript@6.2.2",
    "@codemirror/lint": "https://esm.sh/*@codemirror/lint@6.8.4",
    "@codemirror/search": "https://esm.sh/*@codemirror/search@6.5.8",
    "@codemirror/state": "https://esm.sh/*@codemirror/state@6.5.0",
    "@codemirror/theme-one-dark": "https://esm.sh/*@codemirror/theme-one-dark@6.1.2",
    "@codemirror/view": "https://esm.sh/*@codemirror/view@6.35.0",
    "codemirror": "https://esm.sh/*codemirror@6.0.1"
  }
}
</script>`;
}

export function getCodeMirrorScript(): string {
	return `import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap, Decoration, ViewPlugin, lineNumbers, highlightSpecialChars, hoverTooltip, tooltips } from "@codemirror/view";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { indentWithTab } from "@codemirror/commands";

// ── Read-only code viewer ──
const viewerInstances = new Map();

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// entries: [{ line, cls }] — one line decoration per entry, any number of classes per line.
function makeLineDecoPlugin(entries) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.buildDecos(view);
    }
    buildDecos(view) {
      const builder = [];
      for (const en of entries) {
        if (en.line >= 1 && en.line <= view.state.doc.lines) {
          const deco = Decoration.line({ attributes: { class: en.cls } });
          builder.push(deco.range(view.state.doc.line(en.line).from));
        }
      }
      return Decoration.set(builder, true);
    }
    update() {}
  }, { decorations: (v) => v.decorations });
}

function makeLineTooltipPlugin(lineMetadata) {
  return hoverTooltip(function(view, pos) {
    const line = view.state.doc.lineAt(pos);
    const lineNum = line.number;
    const entries = lineMetadata[lineNum];
    if (!entries || entries.length === 0) return null;
    return {
      pos: line.from,
      above: true,
      create: function() {
        const dom = document.createElement("div");
        dom.className = "cm-line-tooltip";
        dom.innerHTML = entries.map(function(e) {
          const sevColor = e.severity === "error" ? "var(--sev-error)"
            : e.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";
          return '<div class="cm-line-tooltip-entry">' +
            '<div class="cm-line-tooltip-header">' +
              '<span class="cm-line-tooltip-dot" style="background:' + sevColor + '"></span>' +
              '<span class="cm-line-tooltip-rule">' + escHtml(e.rule) + '</span>' +
            '</div>' +
            '<span class="cm-line-tooltip-msg">' + escHtml(e.message) + '</span>' +
          '</div>';
        }).join("");
        return { dom: dom };
      }
    };
  }, { hitSide: true });
}

window.createCodeViewer = function(container, code, options) {
  options = options || {};
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if (!el) return null;

  const key = el.id || el;
  if (viewerInstances.has(key)) {
    viewerInstances.get(key).destroy();
    viewerInstances.delete(key);
  }
  el.innerHTML = "";

  const firstLineNumber = options.firstLineNumber || 1;
  const showLineNumbers = options.lineNumbers !== false;
  const highlightLine = options.highlightLine || 0;
  // highlightLines: neutral "here's the definition/call site" marker (blue-grey).
  // diagnosticLines: severity-red marker, reserved for diagnostic navigation.
  const highlightLines = options.highlightLines || (highlightLine > 0 ? [highlightLine] : []);
  const diagnosticLines = options.diagnosticLines || [];
  const tintRangeStart = options.tintRangeStart || 0;
  const tintRangeEnd = options.tintRangeEnd || 0;
  const lineMetadata = options.lineMetadata || null;

  const extensions = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    highlightSpecialChars(),
    javascript({ typescript: true }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    EditorView.theme({
      "&": { fontSize: "12px" },
      ".cm-scroller": {
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
        fontSize: "12px",
        lineHeight: "1.6",
        overflow: "auto",
      },
      ".cm-gutters": { background: "transparent", border: "none" },
      ".cm-highlighted-line": {
        background: "rgba(234,40,69,0.12) !important",
        borderLeft: "3px solid #ea2845",
        cursor: "pointer",
      },
      ".cm-neutral-line": {
        background: "rgba(59,130,246,0.10) !important",
        borderLeft: "2px solid #3b82f6",
      },
      ".cm-range-tint": {
        background: "rgba(59,130,246,0.05)",
      },
    }),
  ];

  if (showLineNumbers) {
    extensions.push(lineNumbers({ formatNumber: (n) => String(n + firstLineNumber - 1) }));
  }

  const lineDecoEntries = [];
  if (tintRangeEnd > tintRangeStart) {
    for (let l = tintRangeStart; l <= tintRangeEnd; l++) {
      lineDecoEntries.push({ line: l, cls: "cm-range-tint" });
    }
  }
  for (const dl of diagnosticLines) lineDecoEntries.push({ line: dl, cls: "cm-highlighted-line" });
  for (const hl of highlightLines) lineDecoEntries.push({ line: hl, cls: "cm-neutral-line" });
  if (lineDecoEntries.length > 0) {
    extensions.push(makeLineDecoPlugin(lineDecoEntries));
  }

  if (lineMetadata) {
    extensions.push(makeLineTooltipPlugin(lineMetadata));
    extensions.push(tooltips({ parent: document.body }));
  }

  const view = new EditorView({
    doc: code,
    extensions: extensions,
    parent: el,
  });

  viewerInstances.set(key, view);

  const scrollTargetLines = highlightLines.length > 0 ? highlightLines : diagnosticLines;
  if (scrollTargetLines.length > 0 && !options.skipScrollIntoView) {
    const firstHL = scrollTargetLines[0];
    requestAnimationFrame(() => {
      if (firstHL >= 1 && firstHL <= view.state.doc.lines) {
        const line = view.state.doc.line(firstHL);
        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
      }
    });
  }

  return view;
};

window.dispatchEvent(new Event("cm-ready"));

// ── Lab editor ──
const parent = document.getElementById("pg-cm-editor");
if (parent) {
  const editor = new EditorView({
    doc: document.getElementById("pg-code-init").textContent,
    extensions: [
      basicSetup,
      javascript({ typescript: true }),
      oneDark,
      keymap.of([indentWithTab]),
      EditorView.theme({
        "&": { flex: "1", minHeight: "200px" },
        ".cm-editor": { height: "100%" },
        ".cm-scroller": { overflow: "auto" },
      }),
    ],
    parent: parent,
  });
  window.cmEditor = editor;
}`;
}
