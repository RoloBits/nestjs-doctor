import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { getReportHtml } from "../../src/report/ui/html.js";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { RICH_ARTIFACT_JSON } from "./report-artifact-fixture.js";

const TABS = ["summary", "diagnosis", "lab", "modules", "schema", "endpoints"];

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
	win.Element.prototype.scrollIntoView = () => undefined;
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
	win.eval(getReportScripts(RICH_ARTIFACT_JSON));
	const snap: Record<string, string> = {};
	for (const tab of TABS) {
		(win as Record<string, unknown>).__t = tab;
		win.eval("switchTab(__t)");
		snap[tab] = win.document.body.innerHTML;
	}
	for (const tab of TABS) {
		expect(snap[tab].length).toBeGreaterThan(1000);
	}
	expect(snap.summary).toContain("ov-stat-row");

	// The sidebar trees actually rendered, so a change to their markup is
	// visible here rather than passing on an empty panel.
	const rows = (tab: string) =>
		(snap[tab].match(/class="st-row/g) || []).length;
	expect(rows("modules")).toBeGreaterThan(0);
	expect(rows("schema")).toBeGreaterThan(0);
	expect(rows("endpoints")).toBeGreaterThan(0);

	// The detail panel only renders on selection, so drive one per module
	// through the same entry point the page uses.
	win.eval("switchTab('modules')");
	const detail = win.eval(
		"Array.from(document.querySelectorAll('#mg-tree [data-module]'))" +
			".map(function (row) {" +
			"  REPORT_APP.openModule(row.dataset.module);" +
			"  return document.getElementById('detail').innerHTML;" +
			"}).join('')"
	) as string;
	// Every badge variant the panel can draw, so a change to one is visible
	// here rather than only in the source text.
	for (const variant of [
		"md-project",
		"md-global",
		"md-cycle",
		"md-root",
		"md-scope",
		"md-use",
		"md-token",
		"md-module",
		"md-unused",
		"md-ext",
	]) {
		expect(detail).toContain(variant);
	}

	// Selecting covers the sidebar list with the detail panel; closing restores it.
	win.eval(
		"REPORT_APP.openModule(" +
			"document.querySelector('#mg-tree [data-module]').dataset.module)"
	);
	const sidebar = win.document.getElementById("mg-sidebar") as HTMLElement;
	expect(sidebar.className).toContain("mg-detail-open");
	win.eval("REPORT_APP.openModule(null)");
	expect(sidebar.className).not.toContain("mg-detail-open");
});

it("renderChrome host options hide tabs and share and add load file", () => {
	const dom = new JSDOM(`<body>${getReportHtml()}</body>`, {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const win = dom.window as unknown as typeof globalThis & Window;
	stubCanvas(win);
	win.eval(getReportScripts(RICH_ARTIFACT_JSON));

	// Baseline: the CLI page keeps its share button and every tab.
	expect(win.document.getElementById("nav-share")).not.toBeNull();
	expect(win.document.getElementById("nav-load")).toBeNull();
	const tabStyle = (tab: string) =>
		(win.document.querySelector(`[data-tab="${tab}"]`) as HTMLElement).style
			.display;
	expect(tabStyle("modules")).not.toBe("none");

	(win as Record<string, unknown>).__report = JSON.parse(RICH_ARTIFACT_JSON);
	(win as Record<string, unknown>).__onLoad = () => undefined;
	win.eval(
		"REPORT_APP.renderChrome(__report," +
			" {hiddenTabs: ['modules', 'lab'], hideShare: true, onLoadAnother: __onLoad})"
	);
	expect(win.document.getElementById("nav-share")).toBeNull();
	expect(win.document.getElementById("nav-load")).not.toBeNull();
	expect(tabStyle("modules")).toBe("none");
	expect(tabStyle("lab")).toBe("none");
	expect(tabStyle("summary")).not.toBe("none");
});

it("shows the floating tooltip for data-tip elements in the header", () => {
	const dom = new JSDOM(`<body>${getReportHtml()}</body>`, {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const win = dom.window as unknown as typeof globalThis & Window;
	stubCanvas(win);
	win.eval(getReportScripts(RICH_ARTIFACT_JSON));

	const tip = win.document.getElementById("mg-float-tip");
	expect(tip).not.toBeNull();
	expect(tip?.style.display).not.toBe("block");

	const badge = win.document.querySelector("#header-meta .meta-badge");
	expect(badge).not.toBeNull();
	badge?.setAttribute("data-tip", "a clipped explanation");
	badge?.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
	expect(tip?.style.display).toBe("block");
	expect(tip?.textContent).toBe(badge?.getAttribute("data-tip"));

	win.document.body.dispatchEvent(
		new win.MouseEvent("mouseover", { bubbles: true })
	);
	expect(tip?.style.display).toBe("none");
});

it("shows the floating tooltip for a phase in the boot overview lane", () => {
	const dom = new JSDOM(`<body>${getReportHtml()}</body>`, {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const win = dom.window as unknown as typeof globalThis & Window;
	stubCanvas(win);
	win.eval(getReportScripts(RICH_ARTIFACT_JSON));

	const lane = win.document.createElement("div");
	lane.className = "boot-lane boot-overview";
	lane.innerHTML =
		'<span class="boot-phases"><span class="boot-phase" data-tip="<1ms · listen"></span></span>';
	win.document.body.appendChild(lane);
	const phase = lane.querySelector(".boot-phase");
	phase?.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
	const tip = win.document.getElementById("mg-float-tip");
	expect(tip?.style.display).toBe("block");
	expect(tip?.textContent).toBe("<1ms · listen");
});
