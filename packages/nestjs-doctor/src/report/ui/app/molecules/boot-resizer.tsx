import { type RefObject, useEffect, useRef } from "react";

const SIDE_MIN = 200;
const SIDE_MAX = 640;

interface BootResizerProps {
	/** The view whose `--boot-label-w` the drag rewrites. */
	viewRef: RefObject<HTMLDivElement | null>;
}

// The divider between the label column and the lanes; dragging it resizes
// the column, the way the graph sidebar's resizer does.
export function BootResizer({ viewRef }: BootResizerProps) {
	const resizerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const resizer = resizerRef.current;
		const view = viewRef.current;
		if (!(resizer && view)) {
			return;
		}
		let stop: (() => void) | null = null;
		const onDown = (ev: MouseEvent) => {
			ev.preventDefault();
			const startX = ev.clientX;
			const startW = Number.parseFloat(
				getComputedStyle(view).getPropertyValue("--boot-label-w")
			);
			document.body.classList.add("mg-resizing");
			const onMove = (mv: MouseEvent) => {
				const width = Math.max(
					SIDE_MIN,
					Math.min(SIDE_MAX, startW + (mv.clientX - startX))
				);
				view.style.setProperty("--boot-label-w", `${width}px`);
			};
			const onUp = () => stop?.();
			stop = () => {
				stop = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.classList.remove("mg-resizing");
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		};
		resizer.addEventListener("mousedown", onDown);
		return () => {
			resizer.removeEventListener("mousedown", onDown);
			stop?.();
		};
	}, [viewRef]);

	return <div className="boot-resizer" ref={resizerRef} />;
}
