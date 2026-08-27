"use client";

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

interface CodeViewerProps {
	code: string;
	height?: string;
}

/**
 * Read-only source viewer. Kept imperative on purpose: CodeMirror needs a
 * live DOM node and full control of its container.
 */
export function CodeViewer({ code, height = "16em" }: CodeViewerProps) {
	const host = useRef<HTMLDivElement | null>(null);
	const view = useRef<EditorView | null>(null);

	useEffect(() => {
		if (!host.current) {
			return;
		}
		const state = EditorState.create({
			doc: code,
			extensions: [
				EditorView.lineWrapping,
				EditorView.theme({
					"&": { background: "transparent", fontSize: "12px" },
					".cm-scroller": { fontFamily: "inherit" },
				}),
			],
		});
		const v = new EditorView({ state, parent: host.current });
		view.current = v;
		return () => {
			v.destroy();
			view.current = null;
		};
	}, [code]);

	return (
		<div className="code-viewer" ref={host} style={{ maxHeight: height }} />
	);
}
