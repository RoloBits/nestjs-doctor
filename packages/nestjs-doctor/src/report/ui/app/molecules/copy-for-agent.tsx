import { useEffect, useState } from "react";
import { TextButton } from "../atoms/button.js";

interface CopyForAgentProps {
	/** Beacon action name counted on each copy. */
	event: string;
	id: string;
	/** File stem when the clipboard refuses and the text downloads instead. */
	name: string;
	text: () => string;
	tip: string;
}

function downloadText(text: string, name: string): void {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
	a.download = `${name.replace(/[^\w.-]+/g, "-")}.txt`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(a.href);
}

/** Copies a text for an agent; a browser that refuses the clipboard gets a download. */
export function CopyForAgent({
	event,
	id,
	name,
	text,
	tip,
}: CopyForAgentProps) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) {
			return;
		}
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);
	const copy = () => {
		const value = text();
		(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
		const write = navigator.clipboard?.writeText(value);
		if (!write) {
			downloadText(value, name);
			setCopied(true);
			return;
		}
		write.then(
			() => setCopied(true),
			() => {
				downloadText(value, name);
				setCopied(true);
			}
		);
	};
	return (
		<TextButton classes="dc-copy" id={id} onClick={copy} tip={tip}>
			{copied ? "Copied" : "Copy for AI agent"}
		</TextButton>
	);
}
