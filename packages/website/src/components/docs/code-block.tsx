"use client";

import { useCallback, useRef, useState } from "react";

const RESET_MS = 1600;

const CopyIcon = () => (
	<svg
		aria-hidden="true"
		fill="none"
		height="14"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="1.5"
		viewBox="0 0 24 24"
		width="14"
	>
		<rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</svg>
);

const CheckIcon = () => (
	<svg
		aria-hidden="true"
		fill="none"
		height="14"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="2"
		viewBox="0 0 24 24"
		width="14"
	>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

export const CodeBlock = ({
	className,
	...props
}: React.ComponentProps<"pre">) => {
	const ref = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);

	const copy = useCallback(async () => {
		const text = ref.current?.textContent;
		if (!text) {
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), RESET_MS);
		} catch {
			// Clipboard blocked; the code stays selectable.
		}
	}, []);

	return (
		<div className="group relative mt-4 mb-4 overflow-hidden rounded-lg border border-white/10 bg-[#0d0d0d]">
			<pre
				className={`overflow-x-auto py-4 pr-14 pl-4 text-sm leading-relaxed ${className ?? ""}`}
				ref={ref}
				{...props}
			/>
			<button
				aria-label={copied ? "Copied" : "Copy code"}
				className="absolute top-2.5 right-2.5 rounded p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
				onClick={copy}
				type="button"
			>
				{copied ? <CheckIcon /> : <CopyIcon />}
			</button>
		</div>
	);
};
