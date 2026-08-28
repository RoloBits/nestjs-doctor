import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, type Range } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
	Decoration,
	type DecorationSet,
	highlightSpecialChars,
	hoverTooltip,
	keymap,
	lineNumbers,
	tooltips,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";

// Browser port of the CLI report's esm.sh module script; keep in step with
// packages/nestjs-doctor/src/report/ui/codemirror.ts.
const REPORT_FONT_STACK =
	'"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface LineMetadataEntry {
	message: string;
	rule: string;
	severity: string;
}

interface CodeViewerOptions {
	firstLineNumber?: number;
	highlightLine?: number;
	highlightLines?: number[];
	lineMetadata?: Record<number, LineMetadataEntry[]>;
	lineNumbers?: boolean;
	skipScrollIntoView?: boolean;
}

interface ReportGlobals {
	cmEditor?: EditorView;
	createCodeViewer?: (
		container: string | HTMLElement,
		code: string,
		options?: CodeViewerOptions
	) => EditorView | null;
}

const viewerInstances = new Map<string | HTMLElement, EditorView>();

function escHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function makeHighlightPlugin(targetLines: number[]) {
	const lineDeco = Decoration.line({
		attributes: { class: "cm-highlighted-line" },
	});
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				const builder: Range<Decoration>[] = [];
				for (const tl of targetLines) {
					if (tl >= 1 && tl <= view.state.doc.lines) {
						builder.push(lineDeco.range(view.state.doc.line(tl).from));
					}
				}
				this.decorations = Decoration.set(builder, true);
			}
			update() {
				return;
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

function makeLineTooltipPlugin(
	lineMetadata: Record<number, LineMetadataEntry[]>
) {
	return hoverTooltip((view, pos) => {
		const line = view.state.doc.lineAt(pos);
		const entries = lineMetadata[line.number];
		if (!entries || entries.length === 0) {
			return null;
		}
		return {
			pos: line.from,
			above: true,
			create: () => {
				const dom = document.createElement("div");
				dom.className = "cm-line-tooltip";
				dom.innerHTML = entries
					.map((e) => {
						let sevColor = "var(--sev-info)";
						if (e.severity === "error") {
							sevColor = "var(--sev-error)";
						} else if (e.severity === "warning") {
							sevColor = "var(--sev-warning)";
						}
						return (
							'<div class="cm-line-tooltip-entry">' +
							'<div class="cm-line-tooltip-header">' +
							`<span class="cm-line-tooltip-dot" style="background:${sevColor}"></span>` +
							`<span class="cm-line-tooltip-rule">${escHtml(e.rule)}</span>` +
							"</div>" +
							`<span class="cm-line-tooltip-msg">${escHtml(e.message)}</span>` +
							"</div>"
						);
					})
					.join("");
				return { dom };
			},
		};
	});
}

function createCodeViewer(
	container: string | HTMLElement,
	code: string,
	options: CodeViewerOptions = {}
): EditorView | null {
	const el =
		typeof container === "string"
			? document.getElementById(container)
			: container;
	if (!el) {
		return null;
	}

	const key = el.id || el;
	const existing = viewerInstances.get(key);
	if (existing) {
		existing.destroy();
		viewerInstances.delete(key);
	}
	el.innerHTML = "";

	const firstLineNumber = options.firstLineNumber || 1;
	const showLineNumbers = options.lineNumbers !== false;
	const highlightLine = options.highlightLine || 0;
	const highlightLines =
		options.highlightLines || (highlightLine > 0 ? [highlightLine] : []);
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
				fontFamily: REPORT_FONT_STACK,
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
		extensions.push(
			lineNumbers({ formatNumber: (n) => String(n + firstLineNumber - 1) })
		);
	}

	if (highlightLines.length > 0) {
		extensions.push(makeHighlightPlugin(highlightLines));
	}

	if (lineMetadata) {
		extensions.push(makeLineTooltipPlugin(lineMetadata));
		extensions.push(tooltips({ parent: document.body }));
	}

	const view = new EditorView({ doc: code, extensions, parent: el });
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
}

/** Puts the factory where the report app's CodeViewer molecule looks for it. */
export function installCodeViewer(): void {
	(globalThis as ReportGlobals).createCodeViewer = createCodeViewer;
}

export function uninstallCodeViewer(): void {
	for (const view of viewerInstances.values()) {
		view.destroy();
	}
	viewerInstances.clear();
	const g = globalThis as ReportGlobals;
	g.createCodeViewer = undefined;
	g.cmEditor = undefined;
}

/** Mounts the Rule Lab's live editor once the lab template is in the DOM. */
export function initLabEditor(track: (event: string) => void): void {
	const parent = document.getElementById("pg-cm-editor");
	if (!parent) {
		return;
	}
	const g = globalThis as ReportGlobals;
	g.cmEditor?.destroy();
	let labEdited = false;
	const editor = new EditorView({
		doc: document.getElementById("pg-code-init")?.textContent ?? "",
		extensions: [
			basicSetup,
			javascript({ typescript: true }),
			oneDark,
			keymap.of([indentWithTab]),
			EditorView.updateListener.of((u: ViewUpdate) => {
				// isUserEvent is false for the programmatic dispatch a preset load makes.
				if (labEdited || !u.docChanged) {
					return;
				}
				if (!u.transactions.some((t) => t.isUserEvent("input"))) {
					return;
				}
				labEdited = true;
				track("rule_lab_code_edited");
			}),
			EditorView.theme({
				"&": { flex: "1", minHeight: "200px" },
				".cm-editor": { height: "100%" },
				".cm-scroller": { overflow: "auto" },
			}),
		],
		parent,
	});
	g.cmEditor = editor;
}
