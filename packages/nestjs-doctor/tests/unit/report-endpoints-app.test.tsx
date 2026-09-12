// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import type { CodeGraph } from "../../src/common/code-graph.js";
import { encodeCodeGraph } from "../../src/common/code-graph-codec.js";
import { EndpointsTab } from "../../src/report/ui/app/templates/endpoints.js";
import {
	callsGraph,
	EMPTY_ARTIFACT,
	RICH_ARTIFACT,
} from "./report-artifact-fixture.js";

// The schema tab registers the real implementation on mount, so the seam the
// model chip calls through is stubbed instead of mounting a second tab.
const { schemaOpens } = vi.hoisted(() => ({ schemaOpens: [] as string[] }));
vi.mock("../../src/report/ui/app/templates/schema.js", () => ({
	openSchemaEntity: (name: string) => {
		schemaOpens.push(name);
	},
}));

const DB_TAG = /READ|WRITE/;

interface ViewerCall {
	code: string;
	options: { highlightLines?: number[]; hitLines?: number[] };
}

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("EndpointsTab", () => {
	let container: HTMLDivElement;
	let root: Root;

	let viewers: ViewerCall[] = [];

	beforeEach(() => {
		viewers = [];
		(
			globalThis as {
				createCodeViewer?: (
					el: unknown,
					code: string,
					options: ViewerCall["options"]
				) => void;
			}
		).createCodeViewer = (_el, code, options) => {
			viewers.push({ code, options });
		};
		localStorage.clear();
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

	const nth = (selector: string, index: number) => {
		act(() => {
			container
				.querySelectorAll<HTMLElement>(selector)
				[index]?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
	};

	/** The fixture route is long enough to open on `database`. */
	const showAll = () => click('.dc-chip[title="every step of the walk"]');

	const pane = () => container.querySelector(".dc-code");
	const paneMethod = () =>
		container.querySelector(".dc-code-name")?.textContent;
	const panePath = () =>
		container.querySelector(".dc-code-path")?.getAttribute("title");
	const paneShown = () => container.querySelector(".dc-code-path")?.textContent;

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
		showAll();
		expect(blocks()).toBe(0);
		click("#endpoints-next");
		expect(blocks()).toBe(1);
		click("#endpoints-next");
		expect(blocks()).toBe(2);
		expect(
			container.querySelector('.dc-block[data-top="1"] .dc-block-m')
				?.textContent
		).toBe("load");
		expect(
			container.querySelector('.dc-block[data-top="1"] .dc-block-cls')
				?.textContent
		).toBe("AService");
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
			container.querySelectorAll(".dc-filter .dc-verdict-counts")[1]
				?.textContent;
		showAll();
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

	// Selecting is looking; seeking is moving the playhead. Only seeking may
	// rebuild the pile, and the pile is what the reader was looking at.
	describe("selecting never seeks", () => {
		const stat = () =>
			container.querySelector("#endpoints-pile-stat")?.textContent;
		const stepNum = () =>
			container.querySelector("#endpoints-step-num")?.textContent;

		const playToEnd = () => {
			showAll();
			for (let i = 0; i < 12; i++) {
				click("#endpoints-next");
			}
		};

		it("keeps every block and the playhead when a block is picked", () => {
			mount(RICH_ARTIFACT);
			playToEnd();
			expect(stat()).toBe("10 blocks · top @9");
			expect(stepNum()).toBe("9 / 9");

			const picked = container
				.querySelectorAll(".dc-block")[6]
				?.querySelector(".dc-block-m")?.textContent;
			nth(".dc-block", 6);

			expect(stat()).toBe("10 blocks · top @9");
			expect(stepNum()).toBe("9 / 9");
			expect(container.querySelector(".dc-code-name")?.textContent).toContain(
				picked
			);
		});

		it("keeps every block when a map card is picked", () => {
			mount(RICH_ARTIFACT);
			playToEnd();
			nth(".dc-card", 0);
			expect(stat()).toBe("10 blocks · top @9");
			expect(stepNum()).toBe("9 / 9");
		});

		it("marks the picked block and its card, and holds the mark", () => {
			mount(RICH_ARTIFACT);
			playToEnd();
			nth(".dc-block", 2);
			expect(
				container.querySelectorAll('.dc-block[data-sel="1"]')
			).toHaveLength(1);
			expect(container.querySelectorAll('.dc-card[data-sel="1"]')).toHaveLength(
				1
			);
			click("#endpoints-prev");
			expect(container.querySelectorAll('.dc-card[data-sel="1"]')).toHaveLength(
				1
			);
		});

		it("still seeks from the step list, which is a seek control", () => {
			mount(RICH_ARTIFACT);
			playToEnd();
			expect(stat()).toBe("10 blocks · top @9");
			nth(".dc-step-row", 2);
			expect(stat()).toBe("3 blocks · top @2");
			expect(stepNum()).toBe("2 / 9");
		});
	});

	// The filter is a property of the route, not of the reader's session.
	describe("the default filter per route", () => {
		const pressed = () =>
			[...container.querySelectorAll(".dc-filter-row .dc-chip")]
				.filter((el) => el.getAttribute("aria-pressed") === "true")
				.map((el) => el.textContent);
		const note = () =>
			container.querySelector("#endpoints-default-note")?.textContent;
		const kept = () =>
			container.querySelectorAll(".dc-filter .dc-verdict-counts")[1]
				?.textContent;

		it("opens a long route with db steps on database", () => {
			mount(RICH_ARTIFACT);
			expect(pressed()).toEqual(["database"]);
			expect(note()).toBe("default: database \u2014 10 steps, 3 db");
			expect(kept()).toBe("3 of 10 steps kept");
		});

		it("opens a short route on all", () => {
			mount(RICH_ARTIFACT);
			nth(".ep-endpoint-row", 1);
			expect(pressed()).toEqual(["all"]);
			expect(note()).toBe("default: all \u2014 1 step");
			expect(kept()).toBe("1 of 1 steps kept");
		});

		it("keeps a manual choice until the route changes", () => {
			mount(RICH_ARTIFACT);
			showAll();
			expect(pressed()).toEqual(["all"]);

			// A step does not re-apply the rule; only picking a route does.
			click("#endpoints-next");
			expect(pressed()).toEqual(["all"]);

			nth(".ep-endpoint-row", 1);
			expect(pressed()).toEqual(["all"]);
			nth(".ep-endpoint-row", 0);
			expect(pressed()).toEqual(["database"]);
		});

		it("writes nothing about the filter to storage", () => {
			mount(RICH_ARTIFACT);
			showAll();
			click('.dc-chip[title^="only the steps that land on a db node"]');
			nth(".ep-endpoint-row", 1);
			expect(Object.keys(localStorage)).toEqual(["nd.endpoints.codeWidth"]);
		});
	});

	// A db node's body is the ORM client's generated accessor, which is never
	// what the reader meant by "show me this call".
	describe("db and external nodes open at the call site", () => {
		const SOURCED: ReportArtifact = {
			...RICH_ARTIFACT,
			root: "src",
			sources: {
				"src/a.controller.ts": "c\n".repeat(20),
				"src/a.service.ts": "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl",
				"src/calls.controller.ts": "x\n".repeat(60),
				"src/prisma.service.ts": "p\np\np",
			},
		};
		const dbCard = () =>
			[...container.querySelectorAll(".dc-card")].findIndex((el) =>
				DB_TAG.test(el.querySelector(".dc-tag")?.textContent ?? "")
			);

		it("shows the caller's file, not the db node's own", () => {
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			expect(panePath()).toBe("src/a.service.ts");
			expect(paneShown()).toBe("a.service.ts");
			expect(container.querySelector(".dc-code-name")?.textContent).toBe(
				"AService#load"
			);
		});

		it("names the db call it reached, with its effect", () => {
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			const callee = container.querySelector("#endpoints-callee");
			expect(callee?.textContent).toContain("PrismaService.user.findUnique");
			expect(callee?.textContent).toContain("db read");
		});

		it("marks the call line hardest and scrolls to it, keeping the method", () => {
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			const last = viewers.at(-1) as ViewerCall;
			expect(last.options.hitLines).toEqual([2]);
			// The viewer scrolls to the first highlighted line.
			expect(last.options.highlightLines?.[0]).toBe(2);
			expect(last.options.highlightLines).toEqual([
				2, 1, 3, 4, 5, 6, 7, 8, 9, 10,
			]);
		});

		it("offers no decl escape hatch on a db node, but both on a service", () => {
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			expect(container.querySelector("#endpoints-modes")).toBeNull();

			nth(".dc-card", 1);
			expect(container.querySelector("#endpoints-mode-decl")).not.toBeNull();
			expect(container.querySelector("#endpoints-mode-call")).not.toBeNull();
			click("#endpoints-mode-call");
			expect(panePath()).toBe("src/a.controller.ts");
		});

		it("renders the caller's code for a node outside the project", () => {
			const artifact: ReportArtifact = {
				...RICH_ARTIFACT,
				codeGraph: encodeCodeGraph(callsGraph(1, "unresolved")),
				sources: { "src/calls.controller.ts": "x\n".repeat(60) },
			};
			mount(artifact);
			nth(".dc-card", 1);
			expect(panePath()).toBe("src/calls.controller.ts");
			expect(container.querySelector("#endpoints-code-none")).toBeNull();
		});
	});

	describe("the visit strip", () => {
		const MANY: ReportArtifact = {
			...RICH_ARTIFACT,
			codeGraph: encodeCodeGraph(callsGraph(40, "service")),
			sources: { "src/calls.controller.ts": "x\n".repeat(60) },
		};

		it("caps the chips and offers the rest behind a pager", () => {
			mount(MANY);
			nth(".dc-card", 1);
			expect(container.querySelectorAll(".dc-visits .dc-visit")).toHaveLength(
				5
			);
			expect(
				container.querySelector("#endpoints-visits-more")?.textContent
			).toBe("+36");
			click("#endpoints-visits-more");
			expect(
				[...container.querySelectorAll(".dc-visits .dc-visit")]
					.slice(0, 4)
					.map((el) => el.textContent)
			).toEqual(["@5", "@6", "@7", "@8"]);
		});

		it("re-targets to another visit without moving the playhead", () => {
			mount(MANY);
			click("#endpoints-next");
			click("#endpoints-next");
			const step = () =>
				container.querySelector("#endpoints-step-num")?.textContent;
			expect(step()).toBe("1 / 40");
			nth(".dc-card", 1);
			nth(".dc-visits .dc-visit", 3);
			expect(step()).toBe("1 / 40");
			expect(
				container.querySelector('.dc-visits .dc-visit[aria-pressed="true"]')
					?.textContent
			).toBe("@4");
		});

		it("opens the visit the playhead sits on when a card is clicked", () => {
			mount(MANY);
			for (let i = 0; i < 4; i++) {
				click("#endpoints-next");
			}
			nth(".dc-card", 1);
			expect(
				container.querySelector('.dc-visits .dc-visit[aria-pressed="true"]')
					?.textContent
			).toBe("@3");
		});

		// One controller calling an eight-visit node and then a three-visit one.
		const SPLIT: CodeGraph = (() => {
			const base = callsGraph(8, "service");
			const callee = base.nodes[1] as (typeof base.nodes)[number];
			const other = {
				...callee,
				className: "Other",
				filePath: "src/other.service.ts",
				id: "src/other.service.ts::Other#hit",
			};
			const first = base.edges[0] as (typeof base.edges)[number];
			return {
				...base,
				edges: [
					...base.edges,
					...Array.from({ length: 3 }, (_, i) => ({
						...first,
						line: 30 + i,
						order: 8 + i,
						to: other.id,
					})),
				],
				nodes: [...base.nodes, other],
			};
		})();

		it("starts the chips at the first visit of the node just picked", () => {
			mount({
				...RICH_ARTIFACT,
				codeGraph: encodeCodeGraph(SPLIT),
				sources: { "src/calls.controller.ts": "x\n".repeat(60) },
			});
			nth(".dc-card", 1);
			click("#endpoints-visits-more");
			expect(
				[...container.querySelectorAll(".dc-visits .dc-visit")]
					.slice(0, 4)
					.map((el) => el.textContent)
			).toEqual(["@5", "@6", "@7", "@8"]);

			nth(".dc-card", 2);
			expect(
				[...container.querySelectorAll(".dc-visits .dc-visit")].map(
					(el) => el.textContent
				)
			).toEqual(["@9", "@10", "@11"]);
		});
	});

	describe("the model chip", () => {
		const SOURCED: ReportArtifact = {
			...RICH_ARTIFACT,
			sources: { "src/a.service.ts": "a\nb\nc" },
		};
		const dbCard = () =>
			[...container.querySelectorAll(".dc-card")].findIndex((el) =>
				DB_TAG.test(el.querySelector(".dc-tag")?.textContent ?? "")
			);

		it("matches the prisma accessor to the entity, case-insensitively", () => {
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			expect(container.querySelector(".dc-model-name")?.textContent).toBe(
				"User"
			);
			expect(container.querySelector("#endpoints-model-body")).toBeNull();
			click("#endpoints-model");
			const body = container.querySelector("#endpoints-model-body");
			expect(body?.textContent).toContain("id");
			expect(body?.textContent).toContain("uuid");
			expect(body?.textContent).toContain("pk");
			expect(body?.textContent).toContain("email");
		});

		it("lists a relation as an arrow to the other entity", () => {
			const withRel: ReportArtifact = {
				...SOURCED,
				schema: {
					...SOURCED.schema,
					entities: SOURCED.schema.entities.map((e) =>
						e.name === "User"
							? { ...e, relations: SOURCED.schema.entities[1]?.relations ?? [] }
							: e
					),
				},
			};
			mount(withRel);
			showAll();
			nth(".dc-card", dbCard());
			click("#endpoints-model");
			expect(
				container.querySelector('.dc-model-col[data-rel="1"]')?.textContent
			).toContain("\u2192 User");
		});

		it("selects the entity in the schema tab from the deep link", () => {
			schemaOpens.length = 0;
			const tabs: string[] = [];
			(globalThis as { switchTab?: (name: string) => void }).switchTab = (
				name
			) => {
				tabs.push(name);
			};
			mount(SOURCED);
			showAll();
			nth(".dc-card", dbCard());
			click("#endpoints-model");
			click("#endpoints-model-open");
			expect(tabs).toEqual(["schema"]);
			expect(schemaOpens).toEqual(["User"]);
		});

		it("dims an accessor no entity answers to, and stays inert", () => {
			const noSchema: ReportArtifact = {
				...SOURCED,
				schema: { ...SOURCED.schema, entities: [] },
			};
			mount(noSchema);
			showAll();
			nth(".dc-card", dbCard());
			const chip = container.querySelector("#endpoints-model");
			expect(chip?.getAttribute("data-empty")).toBe("1");
			expect(chip?.textContent).toContain("not in schema");
			expect(chip?.tagName).toBe("DIV");
			click("#endpoints-model");
			expect(container.querySelector("#endpoints-model-body")).toBeNull();
		});
	});

	describe("the pile block face", () => {
		it("leads with the method, never clipping it", () => {
			mount(RICH_ARTIFACT);
			click("#endpoints-next");
			click("#endpoints-next");
			click("#endpoints-next");
			const face = container.querySelector('.dc-block[data-top="1"]');
			expect(face?.firstElementChild?.className).toBe("dc-block-m");
			expect(
				getComputedStyle(face?.querySelector(".dc-block-m") as Element)
					.whiteSpace
			).not.toBe("nowrap");
		});

		it("puts the db operation and the flags on their own line", () => {
			mount(RICH_ARTIFACT);
			for (let i = 0; i < 4; i++) {
				click("#endpoints-next");
			}
			const withDb = [...container.querySelectorAll(".dc-block")].find((el) =>
				el.querySelector(".dc-block-flags")?.textContent?.includes("db ")
			);
			expect(withDb?.querySelector(".dc-block-m")?.textContent).toBe(
				"user.findUnique"
			);
		});
	});

	describe("the code pane", () => {
		// The fixture's graph is keyed by "src/...", so "src" stands in for the
		// scan root the artifact carries.
		const WITH_SOURCE: ReportArtifact = {
			...RICH_ARTIFACT,
			root: "src",
			sources: {
				"src/a.service.ts": Array.from(
					{ length: 12 },
					(_, i) => `const line${i} = ${i};`
				).join("\n"),
			},
		};

		const drag = (to: number) => {
			act(() => {
				container
					.querySelector("#endpoints-code-grip")
					?.dispatchEvent(
						new MouseEvent("mousedown", { bubbles: true, clientX: 0 })
					);
				document.dispatchEvent(
					new MouseEvent("mousemove", { bubbles: true, clientX: to })
				);
				document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			});
		};

		it("replaces the route rail when a card is clicked", () => {
			mount(WITH_SOURCE);
			expect(pane()).toBeNull();
			nth(".dc-card", 1);
			expect(panePath()).toBe("src/a.service.ts");
			expect(paneMethod()).toBe("AService#load");
			expect(container.querySelector("#endpoints-list")).toBeNull();
			expect(container.querySelector("#endpoints-code-none")).toBeNull();
		});

		it("prints the path relative to the scan root, absolute in the title", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			expect(paneShown()).toBe("a.service.ts");
			expect(panePath()).toBe("src/a.service.ts");
		});

		// A report written before the artifact carried a root, and any node
		// outside the scan, both keep the path the graph gave them.
		it("falls back to the whole path when the artifact carries no root", () => {
			mount({ ...WITH_SOURCE, root: undefined });
			nth(".dc-card", 1);
			expect(paneShown()).toBe("src/a.service.ts");
			expect(panePath()).toBe("src/a.service.ts");
		});

		it("re-targets the pane when a pile block is clicked", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 0);
			expect(panePath()).toBe("src/a.controller.ts");
			showAll();
			click("#endpoints-next");
			click("#endpoints-next");
			nth('.dc-block[data-top="1"]', 0);
			expect(pane()).not.toBeNull();
			expect(panePath()).toBe("src/a.service.ts");
			expect(paneMethod()).toBe("AService#load");
		});

		it("returns to the rail from the back button and from Esc", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			click("#endpoints-code-back");
			expect(pane()).toBeNull();
			expect(container.querySelector("#endpoints-list")).not.toBeNull();

			nth(".dc-card", 1);
			act(() => {
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			});
			expect(pane()).toBeNull();
		});

		// The rail is the only way to another route, so the pane is already
		// closed by the time one can be picked; it stays closed, on the new route.
		it("stays closed when another route is selected", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			expect(pane()).not.toBeNull();
			click("#endpoints-code-back");
			nth(".ep-endpoint-row", 1);
			expect(pane()).toBeNull();
			expect(container.querySelector(".dc-verdict-text")?.textContent).toBe(
				"no db node on this path"
			);
			nth(".dc-card", 0);
			expect(paneMethod()).toBe("AController#peek");
		});

		it("names the file when the report carries no source for it", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 0);
			const empty = container.querySelector("#endpoints-code-none");
			expect(empty?.textContent).toContain("a.controller.ts");
			expect(empty?.textContent).toContain("not in this report");
		});

		it("widens the column instead of covering the map", () => {
			mount(WITH_SOURCE);
			const view = () =>
				container.querySelector(".dc-view")?.getAttribute("style") ?? "";
			expect(view()).toBe("");
			nth(".dc-card", 1);
			expect(view()).toContain("520px");
			expect(view()).toContain("minmax(0, 1fr)");
		});

		it("stores the dragged width and starts from it next time", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			drag(600);
			expect(localStorage.getItem("nd.endpoints.codeWidth")).toBe("600");
			expect(
				container.querySelector(".dc-view")?.getAttribute("style")
			).toContain("600px");
		});

		it("reads the stored width on mount", () => {
			localStorage.setItem("nd.endpoints.codeWidth", "610");
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			expect(
				container.querySelector(".dc-view")?.getAttribute("style")
			).toContain("610px");
		});

		it("releases the body cursor when the pane closes mid-drag", () => {
			mount(WITH_SOURCE);
			nth(".dc-card", 1);
			act(() => {
				container
					.querySelector("#endpoints-code-grip")
					?.dispatchEvent(
						new MouseEvent("mousedown", { bubbles: true, clientX: 0 })
					);
			});
			expect(document.body.style.cursor).toBe("col-resize");

			act(() => {
				document.dispatchEvent(
					new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
				);
			});
			expect(pane()).toBeNull();
			expect(document.body.style.cursor).toBe("");
			expect(document.body.style.userSelect).toBe("");
		});
	});
});
