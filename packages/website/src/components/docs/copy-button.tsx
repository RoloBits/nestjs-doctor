"use client";

import { useCallback, useState } from "react";

const RESET_MS = 1600;

export const CopyButton = ({
	text,
	label = "Copy",
}: {
	text: string;
	label?: string;
}) => {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), RESET_MS);
		} catch {
			// The clipboard was refused; the code stays selectable.
		}
	}, [text]);

	return (
		<button
			className="px-2 py-0.5 font-medium text-[11px] text-white/50 uppercase tracking-wide transition-colors hover:bg-white/5 hover:text-white"
			onClick={copy}
			type="button"
		>
			{copied ? "Copied" : label}
		</button>
	);
};
