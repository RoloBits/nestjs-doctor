import type { RefObject } from "react";

interface BootRowsProps {
	rowsRef: RefObject<HTMLDivElement | null>;
	scrollRef: RefObject<HTMLDivElement | null>;
}

// The scrolling waterfall body. The rows themselves are string-rendered by
// the owner into rowsRef, which is why this holds no children of its own.
export function BootRows({ rowsRef, scrollRef }: BootRowsProps) {
	return (
		<div
			className="boot-scroll"
			id="boot-scroll"
			ref={scrollRef}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose so the row keyboard shortcuts work
			tabIndex={0}
		>
			<div id="boot-rows" ref={rowsRef} />
		</div>
	);
}
