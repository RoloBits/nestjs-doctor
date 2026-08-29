import type { RefObject } from "react";

interface BootRowsProps {
	rowsRef: RefObject<HTMLDivElement | null>;
	scrollRef: RefObject<HTMLDivElement | null>;
}

// The scrolling waterfall body; the owner string-renders the rows into rowsRef.
export function BootRows({ rowsRef, scrollRef }: BootRowsProps) {
	return (
		<div
			className="boot-scroll"
			ref={scrollRef}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose so the row keyboard shortcuts work
			tabIndex={0}
		>
			<div className="boot-rows" ref={rowsRef} />
		</div>
	);
}
