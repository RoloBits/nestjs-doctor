import { IconButton, TextButton } from "../atoms/button.js";

interface ZoomBarProps {
	onFit: () => void;
	onRange: (pct: number) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	pct: number;
	prefix: string;
	subject: string;
}

// The zoom-out / range / zoom-in / value cluster shared by the schema and
// modules-graph canvases. `subject` names what the fit tip resizes.
export function ZoomBar({
	prefix,
	subject,
	pct,
	onZoomIn,
	onZoomOut,
	onRange,
	onFit,
}: ZoomBarProps) {
	return (
		<div id={`${prefix}-zoombar`}>
			<IconButton
				ariaLabel="Zoom out"
				icon="zoomOut"
				id={`${prefix}-zoom-out`}
				modifier="schema-zoom-btn"
				onClick={onZoomOut}
				tip="Zoom out"
			/>
			<input
				aria-label="Zoom"
				id={`${prefix}-zoom-range`}
				max={500}
				min={5}
				onChange={(e) => onRange(Number(e.target.value))}
				step={1}
				type="range"
				value={Math.max(5, Math.min(500, pct))}
			/>
			<IconButton
				ariaLabel="Zoom in"
				icon="zoomIn"
				id={`${prefix}-zoom-in`}
				modifier="schema-zoom-btn"
				onClick={onZoomIn}
				tip="Zoom in"
			/>
			<TextButton
				ariaLabel={`${pct}% · fit to view`}
				classes="schema-zoom-value"
				id={`${prefix}-zoom-value`}
				onClick={onFit}
				tip={`Fit · size the ${subject} to the window`}
			>
				{pct}%
			</TextButton>
		</div>
	);
}
