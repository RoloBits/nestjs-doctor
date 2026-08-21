"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";

const MIN = 15;
const MAX = 85;
const STEP = 4;
const DEFAULT = 50;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/** Two panes with a divider the reader can drag or nudge with arrow keys. */
export const SplitPanes = ({
	left,
	right,
}: {
	left: ReactNode;
	right: ReactNode;
}) => {
	const [pct, setPct] = useState(DEFAULT);
	const frame = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	const setFromClientX = useCallback((clientX: number) => {
		const box = frame.current?.getBoundingClientRect();
		if (!box || box.width === 0) {
			return;
		}
		setPct(clamp(((clientX - box.left) / box.width) * 100));
	}, []);

	const onPointerDown = useCallback((event: React.PointerEvent) => {
		dragging.current = true;
		event.currentTarget.setPointerCapture(event.pointerId);
	}, []);

	const onPointerMove = useCallback(
		(event: React.PointerEvent) => {
			if (dragging.current) {
				setFromClientX(event.clientX);
			}
		},
		[setFromClientX]
	);

	const onPointerUp = useCallback((event: React.PointerEvent) => {
		dragging.current = false;
		event.currentTarget.releasePointerCapture(event.pointerId);
	}, []);

	const onKeyDown = useCallback((event: React.KeyboardEvent) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			setPct((current) => clamp(current - STEP));
		}
		if (event.key === "ArrowRight") {
			event.preventDefault();
			setPct((current) => clamp(current + STEP));
		}
		if (event.key === "Enter") {
			event.preventDefault();
			setPct(DEFAULT);
		}
	}, []);

	return (
		<div
			className="grid"
			ref={frame}
			style={{
				gridTemplateColumns: `minmax(0, ${pct}fr) 5px minmax(0, ${100 - pct}fr)`,
			}}
		>
			{left}
			{/* biome-ignore lint/a11y/useSemanticElements: a focusable separator is the WAI-ARIA splitter pattern */}
			<button
				aria-label="Resize the two panes"
				aria-orientation="vertical"
				aria-valuemax={MAX}
				aria-valuemin={MIN}
				aria-valuenow={Math.round(pct)}
				className="group relative cursor-col-resize touch-none border-0 bg-white/10 p-0 transition-colors hover:bg-nest-red focus-visible:bg-nest-red focus-visible:outline-none"
				onKeyDown={onKeyDown}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				role="separator"
				tabIndex={0}
				type="button"
			>
				<span className="absolute -inset-x-2 inset-y-0" />
			</button>
			{right}
		</div>
	);
};
