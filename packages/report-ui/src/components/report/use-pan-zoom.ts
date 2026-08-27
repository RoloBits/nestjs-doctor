"use client";

import { useCallback, useRef, useState } from "react";

export interface PanZoomState {
	k: number;
	x: number;
	y: number;
}

/** Shared wheel-zoom / drag-pan state for the SVG graph canvases. */
export function usePanZoom(initial: PanZoomState) {
	const [state, setState] = useState<PanZoomState>(initial);
	const dragging = useRef<{ px: number; py: number } | null>(null);

	const onWheel = useCallback((event: React.WheelEvent) => {
		event.preventDefault();
		setState((s) => ({
			...s,
			k: Math.max(0.2, Math.min(4, s.k * (event.deltaY > 0 ? 0.9 : 1.1))),
		}));
	}, []);

	const onPointerDown = useCallback((event: React.PointerEvent) => {
		dragging.current = { px: event.clientX, py: event.clientY };
		(event.target as Element).setPointerCapture?.(event.pointerId);
	}, []);

	const onPointerMove = useCallback((event: React.PointerEvent) => {
		const d = dragging.current;
		if (!d) {
			return;
		}
		setState((s) => ({
			...s,
			x: s.x + event.clientX - d.px,
			y: s.y + event.clientY - d.py,
		}));
		dragging.current = { px: event.clientX, py: event.clientY };
	}, []);

	const onPointerUp = useCallback(() => {
		dragging.current = null;
	}, []);

	return {
		state,
		handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp },
	};
}
