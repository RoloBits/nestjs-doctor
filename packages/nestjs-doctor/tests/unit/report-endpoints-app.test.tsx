// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import { EndpointsTab } from "../../src/report/ui/app/templates/endpoints.js";
import { EMPTY_ARTIFACT, RICH_ARTIFACT } from "./report-artifact-fixture.js";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("EndpointsTab", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	const mount = (artifact: ReportArtifact) => {
		act(() => {
			root.render(<EndpointsTab report={artifact} />);
		});
	};

	const click = (selector: string) => {
		act(() => {
			container
				.querySelector<HTMLElement>(selector)
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
	};

	const blocks = () => container.querySelectorAll(".dc-block").length;

	it("says so when the report carries no code graph", () => {
		mount(EMPTY_ARTIFACT);
		expect(container.textContent).toContain("No code graph in this report");
	});

	it("lists routes grouped by controller with a verdict under each", () => {
		mount(RICH_ARTIFACT);
		expect(container.querySelector(".st-entity-name")?.textContent).toBe(
			"AController"
		);
		expect(container.querySelectorAll(".ep-endpoint-row")).toHaveLength(2);
		expect(container.querySelector(".dc-route-verdict")?.textContent).toBe(
			"read before write · @2 then @5"
		);
	});

	// The tree the canvas view had: the same header, group count, method
	// badge and row classes, in the order the endpoints arrive in.
	it("keeps the tree the endpoints sidebar has always used", () => {
		mount(RICH_ARTIFACT);
		expect(
			container.querySelector(".endpoints-sidebar-header .schema-sidebar-title")
				?.textContent
		).toBe("Endpoints");
		expect(container.querySelector("#endpoints-count")?.textContent).toBe("2");
		expect(container.querySelector(".st-row .st-count")?.textContent).toBe("2");
		expect(
			[...container.querySelectorAll(".ep-method-badge")].map(
				(el) => el.textContent
			)
		).toEqual(["POST", "GET"]);
		expect(container.querySelector(".ep-method-badge")?.className).toContain(
			"ep-method-post"
		);
		expect(
			[...container.querySelectorAll(".ep-endpoint-row .st-label")].map(
				(el) => el.textContent
			)
		).toEqual(["/a", "/a/peek"]);
	});

	it("wears the three sidebar buttons the other trees have", () => {
		mount(RICH_ARTIFACT);
		for (const id of [
			"endpoints-expand-all",
			"endpoints-collapse-all",
			"endpoints-sidebar-collapse",
		]) {
			expect(container.querySelector(`#${id}`), id).not.toBeNull();
		}
	});

	it("collapses and expands the controller groups", () => {
		mount(RICH_ARTIFACT);
		const open = () =>
			container.querySelectorAll(".st-children.st-open").length;
		expect(open()).toBe(1);
		click("#endpoints-collapse-all");
		expect(open()).toBe(0);
		click("#endpoints-expand-all");
		expect(open()).toBe(1);
	});

	it("hides the route list and brings it back", () => {
		mount(RICH_ARTIFACT);
		const view = () => container.querySelector(".dc-view")?.className ?? "";
		expect(view()).not.toContain("dc-side-hidden");
		click("#endpoints-sidebar-collapse");
		expect(view()).toContain("dc-side-hidden");
		click("#endpoints-sidebar-show");
		expect(view()).not.toContain("dc-side-hidden");
	});

	it("shows the db verdict for the selected route", () => {
		mount(RICH_ARTIFACT);
		expect(container.querySelector(".dc-verdict-text")?.textContent).toBe(
			"read before write · @2 then @5"
		);
		expect(container.querySelector(".dc-verdict-counts")?.textContent).toBe(
			"2 read · 1 write"
		);
	});

	it("advances the pile by one block per press of NEXT", () => {
		mount(RICH_ARTIFACT);
		expect(blocks()).toBe(0);
		click("#endpoints-next");
		expect(blocks()).toBe(1);
		click("#endpoints-next");
		expect(blocks()).toBe(2);
		expect(
			container.querySelector('.dc-block[data-top="1"]')?.textContent
		).toContain("AService#load");
	});

	it("advances once per press even when the presses share one render", () => {
		mount(RICH_ARTIFACT);
		act(() => {
			const next = container.querySelector<HTMLElement>("#endpoints-next");
			for (let i = 0; i < 3; i++) {
				next?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
			}
		});
		expect(blocks()).toBe(3);
	});

	it("steps back, and the pile truncates to that step", () => {
		mount(RICH_ARTIFACT);
		click("#endpoints-next");
		click("#endpoints-next");
		click("#endpoints-next");
		expect(blocks()).toBe(3);
		click("#endpoints-prev");
		expect(blocks()).toBe(2);
	});

	// The methodology lives on the docs page; only the caveat that keeps a
	// reader from misreading the columns stays on the tab.
	it("carries the walk caveat on the map head and nothing below the map", () => {
		mount(RICH_ARTIFACT);
		expect(container.querySelector(".dc-map-note")?.textContent).toContain(
			"columns are call depth, not order · source order of call sites walked depth-first, not a runtime trace"
		);
		expect(container.querySelector("#endpoints-main details")).toBeNull();
		const main = container.querySelector("#endpoints-main");
		expect(main?.lastElementChild?.className).toBe("dc-map-wrap");
	});

	it("draws one card per node and one wire per call site", () => {
		mount(RICH_ARTIFACT);
		expect(container.querySelectorAll(".dc-card")).toHaveLength(6);
		expect(container.querySelectorAll(".dc-wire-head")).toHaveLength(7);
	});

	it("changes the kept count when a preset is picked", () => {
		mount(RICH_ARTIFACT);
		const kept = () =>
			container.querySelector(".dc-filter .dc-verdict-counts")?.textContent;
		expect(kept()).toBe("10 of 10 steps kept");
		click('.dc-chip[title^="only the steps that land on a db node"]');
		expect(kept()).toBe("3 of 10 steps kept");
		click('.dc-chip[title^="everything except log"]');
		expect(kept()).toBe("8 of 10 steps kept");
	});

	it("opens the per-category chips behind the ellipsis", () => {
		mount(RICH_ARTIFACT);
		expect(container.querySelectorAll(".dc-filter-row")).toHaveLength(1);
		click("#endpoints-more-filters");
		expect(container.querySelectorAll(".dc-filter-row")).toHaveLength(2);
	});

	it("selects another route and resets the walk", () => {
		mount(RICH_ARTIFACT);
		click("#endpoints-next");
		expect(blocks()).toBe(1);
		act(() => {
			container
				.querySelectorAll<HTMLElement>(".ep-endpoint-row")[1]
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(blocks()).toBe(0);
		expect(container.querySelector(".dc-verdict-text")?.textContent).toBe(
			"no db node on this path"
		);
	});
});
