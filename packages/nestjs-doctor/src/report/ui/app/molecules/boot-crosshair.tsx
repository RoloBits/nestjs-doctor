import type { RefObject } from "react";

interface BootCrosshairProps {
	chipRef: RefObject<HTMLSpanElement | null>;
	lineRef: RefObject<HTMLDivElement | null>;
}

// The vertical line under the pointer with its time on a chip, positioned
// by the owner through the refs on every mouse move.
export function BootCrosshair({ chipRef, lineRef }: BootCrosshairProps) {
	return (
		<div className="boot-cursor" ref={lineRef}>
			<span className="boot-cursor-chip" ref={chipRef} />
		</div>
	);
}
