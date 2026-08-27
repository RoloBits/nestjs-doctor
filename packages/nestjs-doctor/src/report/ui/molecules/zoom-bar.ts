import { iconButton } from "../atoms/button.js";

interface ZoomBarOptions {
	indent?: number;
	prefix: string;
	subject: string;
}

// The zoom-out / range / zoom-in / value cluster shared by the schema and
// modules-graph canvases. `subject` names what the fit tip resizes.
export function zoomBar({
	prefix,
	subject,
	indent = 6,
}: ZoomBarOptions): string {
	const pad = " ".repeat(indent);
	return [
		`${pad}<div id="${prefix}-zoombar">`,
		iconButton({
			id: `${prefix}-zoom-out`,
			icon: "zoomOut",
			modifier: "schema-zoom-btn",
			ariaLabel: "Zoom out",
			tip: "Zoom out",
		}),
		`${pad}  <input type="range" id="${prefix}-zoom-range" min="5" max="500" step="1" value="100" aria-label="Zoom">`,
		iconButton({
			id: `${prefix}-zoom-in`,
			icon: "zoomIn",
			modifier: "schema-zoom-btn",
			ariaLabel: "Zoom in",
			tip: "Zoom in",
		}),
		`${pad}  <button class="schema-zoom-value has-tip" id="${prefix}-zoom-value" aria-label="100% · fit to view" data-tip="Fit · size the ${subject} to the window">100%</button>`,
		`${pad}</div>`,
	].join("\n");
}
