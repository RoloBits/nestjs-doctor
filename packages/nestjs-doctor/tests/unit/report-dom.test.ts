import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { getReportHtml } from "../../src/report/ui/html.js";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { EMPTY_ARTIFACT_JSON } from "./report-artifact-fixture.js";

const TABS = ["summary", "diagnosis", "lab"];

// A canvas context that swallows every call, so the drawing code runs without
// a real 2D backend and the DOM it also builds still gets built.
const CANVAS_STUB: Record<string, unknown> = {
	canvas: { width: 800, height: 600 },
	measureText: () => ({ width: 40 }),
	getImageData: () => ({ data: [] }),
};

// A 2D context that swallows every drawing call, so the canvas code runs
// without a real backend and the DOM it also builds still gets built.
function stubCanvas(win: typeof globalThis & Window) {
	const ctx = new Proxy(CANVAS_STUB, {
		get: (target, key) =>
			key in target ? target[key as string] : () => undefined,
		set: () => true,
	});
	// @ts-expect-error test stub
	win.HTMLCanvasElement.prototype.getContext = () => ctx;
	// @ts-expect-error test stub
	win.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
		width: 800,
		height: 600,
		top: 0,
		left: 0,
		right: 800,
		bottom: 600,
	});
}

it("renders every tab into a DOM", () => {
	const dom = new JSDOM(`<body>${getReportHtml()}</body>`, {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const win = dom.window as unknown as typeof globalThis & Window;
	stubCanvas(win);
	(win as Record<string, unknown>).dagre = {
		graphlib: {
			Graph: class {
				setGraph() {
					return this;
				}
				setDefaultEdgeLabel() {
					return this;
				}
				setNode() {
					return this;
				}
				setEdge() {
					return this;
				}
				nodes(): string[] {
					return [];
				}
				edges(): string[] {
					return [];
				}
				node() {
					return { x: 0, y: 0, width: 10, height: 10 };
				}
			},
		},
		layout: () => undefined,
	};
	win.eval(getReportScripts(EMPTY_ARTIFACT_JSON));
	const snap: Record<string, string> = {};
	for (const tab of TABS) {
		(win as Record<string, unknown>).__t = tab;
		win.eval("switchTab(__t)");
		snap[tab] = win.document.body.innerHTML;
	}
	for (const tab of TABS) {
		expect(snap[tab].length).toBeGreaterThan(1000);
	}
	// The bundled pure helpers reach the page and the tree renders through them.
	expect(win.eval("typeof RPT.buildFileTree")).toBe("function");
	expect(snap.summary).toContain("ov-stat-row");
});
