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

function makeHighlightPlugin(targetLines) {
  const lineDeco = Decoration.line({ attributes: { class: "cm-highlighted-line" } });
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.buildDecos(view);
    }
    buildDecos(view) {
      const builder = [];
      for (const tl of targetLines) {
        if (tl >= 1 && tl <= view.state.doc.lines) {
          builder.push(lineDeco.range(view.state.doc.line(tl).from));
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
  const highlightLines = options.highlightLines || (highlightLine > 0 ? [highlightLine] : []);
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
    }),
  ];

  if (showLineNumbers) {
    extensions.push(lineNumbers({ formatNumber: (n) => String(n + firstLineNumber - 1) }));
  }

  if (highlightLines.length > 0) {
    extensions.push(makeHighlightPlugin(highlightLines));
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

  if (highlightLines.length > 0 && !options.skipScrollIntoView) {
    const firstHL = highlightLines[0];
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
