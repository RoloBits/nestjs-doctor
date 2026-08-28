import { useEffect, useRef } from "react";

export interface CodeViewerOptions {
	firstLineNumber?: number;
	highlightLines?: number[];
	lineMetadata?: Record<
		number,
		{ message: string; rule: string; severity: string }[]
	>;
	lineNumbers?: boolean;
	skipScrollIntoView?: boolean;
}

interface CodeViewerGlobal {
	createCodeViewer?: (
		el: unknown,
		code: string,
		options: CodeViewerOptions
	) => unknown;
}

// Mounts the page's CodeMirror factory into a plain div; the viewer is
// rebuilt whenever the code or options change.
export function CodeViewer({
	code,
	options,
}: {
	code: string;
	options?: CodeViewerOptions;
}) {
	const ref = useRef<globalThis.HTMLDivElement>(null);
	const serialized = JSON.stringify(options ?? {});
	useEffect(() => {
		const factory = (globalThis as CodeViewerGlobal).createCodeViewer;
		if (!(ref.current && factory)) {
			return;
		}
		factory(ref.current, code, JSON.parse(serialized) as CodeViewerOptions);
	}, [code, serialized]);
	return <div ref={ref} />;
}
