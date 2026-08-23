"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";

const COPIED_RESET_MS = 1600;

export const CommandBlock = ({ command }: { command: string }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(command);
			track("command_copied", { command, surface: "landing" });
			setCopied(true);
			setTimeout(() => setCopied(false), COPIED_RESET_MS);
		} catch {
			// Clipboard is unavailable outside a secure context.
		}
	}, [command]);

	const Icon = copied ? Check : Copy;

	return (
		<div className="inline-flex max-w-full items-stretch border border-white/30">
			<code className="overflow-x-auto whitespace-nowrap px-4 py-3 text-[#f2f1ef]">
				<span className="text-white/70">$ </span>
				{command}
			</code>
			<button
				aria-label={`Copy: ${command}`}
				className="flex items-center border-white/30 border-l px-4 text-white/70 transition-colors hover:bg-white hover:text-black"
				onClick={handleCopy}
				type="button"
			>
				<Icon size={14} />
			</button>
		</div>
	);
};
