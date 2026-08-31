// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import {
	BootTab,
	BootView,
	focusBootTrace,
} from "../../src/report/ui/app/templates/boot.js";
import { EMPTY_ARTIFACT } from "./report-artifact-fixture.js";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TIMED_ARTIFACT: ReportArtifact = {
	...EMPTY_ARTIFACT,
	graph: {
		...EMPTY_ARTIFACT.graph,
		timingsAvailable: true,
		startupMs: 400,
		phases: { createMs: 100, initMs: 300, moduleInitMs: 250 },
		timingsTrace: {
			tb: {
				deps: [],
				initTime: 70,
				name: "SchedulingService",
				type: "provider",
			},
			ta: {
				deps: ["tb"],
				hooks: [{ hook: "onModuleInit", ms: 5 }],
				initTime: 100,
				name: "CatsController",
				type: "controller",
			},
		},
		modules: [
			{
				controllers: ["CatsController"],
				exports: [],
				filePath: "src/cats.module.ts",
				imports: [],
				initTimings: [
					{
						id: "ta",
						initTime: 100,
						name: "CatsController",
						type: "controller",
					},
					{
						id: "tb",
						initTime: 70,
						name: "SchedulingService",
						type: "provider",
					},
				],
				name: "CatsModule",
				providers: ["SchedulingService"],
			},
		],
	},
};

// One class from a third-party module the graph has no node for.
const EXTERNAL_ARTIFACT: ReportArtifact = {
	...TIMED_ARTIFACT,
	graph: {
		...TIMED_ARTIFACT.graph,
		modules: [],
		timingsTrace: {
			ta: {
				deps: [],
				initTime: 154,
				module: "TypeOrmModule",
				name: "UserRepository",
				type: "provider",
				via: "UsersModule",
			},
		},
	},
};

describe("BootTab", () => {
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
			root.render(<BootTab report={artifact} />);
		});
	};

	it("renders the empty state without timings", () => {
		mount(EMPTY_ARTIFACT);
		expect(container.textContent).toContain("No boot timings in this report");
	});

	it("renders module groups and class rows on one absolute axis", () => {
		mount(TIMED_ARTIFACT);
		const rows = container.querySelector(".boot-rows");
		expect(rows?.innerHTML).toContain('data-group="CatsModule"');
		expect(rows?.innerHTML).toContain('data-id="ta"');
		expect(rows?.innerHTML).toContain('data-id="tb"');
	});

	it("selects a row when it is clicked", () => {
		mount(TIMED_ARTIFACT);
		const row = container.querySelector<HTMLElement>(
			'.boot-rows [data-id="ta"]'
		);
		act(() => {
			row?.dispatchEvent(
				new MouseEvent("click", { bubbles: true, composed: true })
			);
		});
		const selected = () =>
			container
				.querySelector('.boot-rows [data-id="ta"]')
				?.classList.contains("boot-selected");
		expect(selected()).toBe(true);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"]')
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(selected()).toBe(false);
	});

	it("deep-links to the slowest span through the registry", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			focusBootTrace();
		});
		expect(
			container
				.querySelector('.boot-rows [data-id="ta"]')
				?.classList.contains("boot-selected")
		).toBe(true);
	});

	it("deep-links to a named class", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			focusBootTrace("SchedulingService");
		});
		expect(
			container
				.querySelector('.boot-rows [data-id="tb"]')
				?.classList.contains("boot-selected")
		).toBe(true);
	});

	it("cascades a class's dependencies from its caret", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"] .boot-caret')
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(
			container.querySelector('.boot-rows [data-id="tb"].boot-cascade-row')
		).not.toBeNull();
	});

	it("collapses a module group from its header", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			container
				.querySelector<HTMLElement>(".boot-rows .boot-group-row")
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(
			container.querySelector(".boot-rows .boot-group.boot-collapsed")
		).not.toBeNull();
	});

	it("wears the shared sidebar header with the class count", () => {
		mount(TIMED_ARTIFACT);
		expect(container.querySelector(".schema-sidebar-title")?.textContent).toBe(
			"Boot trace"
		);
		expect(container.querySelector("#boot-class-count")?.textContent).toBe("2");
		expect(container.querySelector(".boot-phases .boot-phase")).not.toBeNull();
	});

	it("collapses and expands every module from the header toolbar", () => {
		mount(TIMED_ARTIFACT);
		const click = (id: string) =>
			act(() => {
				container
					.querySelector<HTMLElement>(`#${id}`)
					?.dispatchEvent(
						new MouseEvent("click", { bubbles: true, composed: true })
					);
			});
		click("boot-collapse-all");
		expect(
			container.querySelector(".boot-rows .boot-group.boot-collapsed")
		).not.toBeNull();
		click("boot-expand-all");
		expect(
			container.querySelector(".boot-rows .boot-group.boot-collapsed")
		).toBeNull();
	});

	it("expands every module and every cascade level from expand all", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			container
				.querySelector<HTMLElement>("#boot-expand-all")
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(
			container.querySelector('.boot-rows [data-id="tb"].boot-cascade-row')
		).not.toBeNull();
	});

	it("hides and shows the label column like the graph sidebar", () => {
		mount(TIMED_ARTIFACT);
		const click = (id: string) =>
			act(() => {
				container
					.querySelector<HTMLElement>(`#${id}`)
					?.dispatchEvent(
						new MouseEvent("click", { bubbles: true, composed: true })
					);
			});
		const view = container.querySelector(".boot-view");
		click("boot-sidebar-collapse");
		expect(view?.classList.contains("boot-side-hidden")).toBe(true);
		click("boot-sidebar-show");
		expect(view?.classList.contains("boot-side-hidden")).toBe(false);
	});

	it("rides a hover card over a bar and hides it when the pointer leaves", () => {
		mount(TIMED_ARTIFACT);
		const rows = container.querySelector<HTMLElement>(".boot-rows");
		const bar = container.querySelector<HTMLElement>(
			'.boot-rows [data-id="ta"] .boot-bar'
		);
		const card = () => container.querySelector<HTMLElement>(".hover-card");
		expect(card()?.hidden).toBe(true);
		act(() => {
			bar?.dispatchEvent(
				new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 30 })
			);
		});
		expect(card()?.hidden).toBe(false);
		// Diagonal from the pointer; with a zero-size bar it lands below.
		expect(card()?.style.left).toBe("66px");
		expect(card()?.style.top).toBe("18px");
		const tether = container.querySelector<HTMLElement>(".hover-card-tether");
		expect(tether?.hidden).toBe(false);
		expect(tether?.style.left).toBe("40px");
		expect(tether?.style.top).toBe("30px");
		expect(tether?.style.width).not.toBe("");
		expect(card()?.textContent).toContain("CatsController");
		expect(card()?.textContent).toContain("SchedulingService");
		expect(card()?.textContent).toContain("30ms");
		expect(card()?.textContent).toContain("in CatsModule · controller");
		act(() => {
			rows?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
		});
		expect(card()?.hidden).toBe(true);
	});

	it("walks every match on Enter in the filter, in order", () => {
		mount(TIMED_ARTIFACT);
		const input = container.querySelector<HTMLInputElement>("#boot-search");
		const press = () =>
			act(() => {
				input?.dispatchEvent(
					new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
				);
			});
		const selected = () =>
			container
				.querySelector(".boot-rows .boot-selected")
				?.getAttribute("data-id");
		press();
		expect(selected()).toBe("tb");
		press();
		expect(selected()).toBe("ta");
		press();
		expect(selected()).toBe("tb");
	});

	it("walks own rows only on Enter, past deduped copies of a later row", () => {
		mount({
			...TIMED_ARTIFACT,
			graph: {
				...TIMED_ARTIFACT.graph,
				modules: [
					{
						controllers: [],
						exports: [],
						filePath: "cats.ts",
						imports: [],
						initTimings: [
							{
								id: "ta",
								initTime: 100,
								name: "CatsService",
								type: "provider",
							},
						],
						name: "CatsModule",
						providers: ["CatsService"],
					},
					{
						controllers: [],
						exports: [],
						filePath: "dogs.ts",
						imports: [],
						initTimings: [
							{
								id: "tb",
								initTime: 120,
								name: "DogsService",
								type: "provider",
							},
							{
								id: "tc",
								initTime: 130,
								name: "VetService",
								type: "provider",
							},
						],
						name: "DogsModule",
						providers: ["DogsService", "VetService"],
					},
				],
				timingsTrace: {
					ta: {
						deps: ["tb"],
						initTime: 100,
						name: "CatsService",
						type: "provider",
					},
					tb: {
						deps: [],
						initTime: 120,
						name: "DogsService",
						type: "provider",
					},
					tc: {
						deps: [],
						initTime: 130,
						name: "VetService",
						type: "provider",
					},
				},
			},
		});
		const fire = (sel: string, ev: Event) =>
			act(() => {
				container.querySelector<HTMLElement>(sel)?.dispatchEvent(ev);
			});
		fire(
			'.boot-rows [data-id="ta"] .boot-caret',
			new MouseEvent("click", { bubbles: true, composed: true })
		);
		expect(
			container.querySelector('.boot-rows [data-id="tb"].boot-cascade-row')
		).not.toBeNull();
		const walk: string[] = [];
		for (let i = 0; i < 4; i++) {
			fire(
				"#boot-search",
				new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
			);
			walk.push(
				container
					.querySelector(".boot-rows .boot-selected")
					?.getAttribute("data-id") ?? ""
			);
		}
		expect(walk).toEqual(["ta", "tb", "tc", "ta"]);
	});

	it("walks own rows only with the arrow keys, and skips collapsed groups", () => {
		mount(TIMED_ARTIFACT);
		const fire = (sel: string, ev: Event) =>
			act(() => {
				container.querySelector<HTMLElement>(sel)?.dispatchEvent(ev);
			});
		const selected = () =>
			container
				.querySelector(".boot-rows .boot-selected")
				?.getAttribute("data-id") ?? null;
		const down = () =>
			fire(
				".boot-scroll",
				new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
			);
		fire(
			'.boot-rows [data-id="ta"] .boot-caret',
			new MouseEvent("click", { bubbles: true, composed: true })
		);
		expect(
			container.querySelector('.boot-rows [data-id="tb"].boot-cascade-row')
		).not.toBeNull();
		down();
		expect(selected()).toBe("tb");
		down();
		expect(selected()).toBe("ta");
		down();
		expect(selected()).toBe("ta");
		fire(
			".boot-rows .boot-group-row",
			new MouseEvent("click", { bubbles: true, composed: true })
		);
		fire(
			"#boot-search",
			new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
		);
		expect(selected()).toBe("ta");
	});

	it("selecting a deduped row opens its module and marks the class's own row", () => {
		mount(TIMED_ARTIFACT);
		const click = (sel: string) =>
			act(() => {
				container
					.querySelector<HTMLElement>(sel)
					?.dispatchEvent(
						new MouseEvent("click", { bubbles: true, composed: true })
					);
			});
		click('.boot-rows [data-id="ta"] .boot-caret');
		click(".boot-rows .boot-group-row");
		expect(
			container.querySelector(".boot-rows .boot-group.boot-collapsed")
		).not.toBeNull();
		click('.boot-rows [data-id="tb"].boot-cascade-row .boot-name');
		expect(
			container.querySelector(".boot-rows .boot-group.boot-collapsed")
		).toBeNull();
		expect(
			container
				.querySelector('.boot-rows .boot-group > [data-id="tb"]')
				?.classList.contains("boot-selected")
		).toBe(true);
	});

	it("hovering a deduped bar names the same class", () => {
		mount(TIMED_ARTIFACT);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"] .boot-caret')
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		const shadow = container.querySelector<HTMLElement>(
			'.boot-rows [data-id="tb"].boot-cascade-row .boot-bar'
		);
		expect(shadow).not.toBeNull();
		act(() => {
			shadow?.dispatchEvent(
				new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 30 })
			);
		});
		const card = container.querySelector<HTMLElement>(".hover-card");
		expect(card?.hidden).toBe(false);
		expect(card?.textContent).toContain("SchedulingService");
		expect(card?.textContent).toContain("construction");
	});

	it("in the dock, selecting a class reports its module and a picked module lights its group", () => {
		const picked: string[] = [];
		act(() => {
			root.render(
				<BootView
					compact
					focusModule="CatsModule"
					graph={TIMED_ARTIFACT.graph}
					onSelectSpan={(span) => picked.push(span.module)}
				/>
			);
		});
		expect(
			container
				.querySelector(".boot-rows .boot-group-row")
				?.classList.contains("boot-group-selected")
		).toBe(true);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"] .boot-name')
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(picked).toEqual(["CatsModule"]);
	});

	it("zooms to a zero-duration phase when it is clicked", () => {
		const artifact: ReportArtifact = {
			...TIMED_ARTIFACT,
			graph: {
				...TIMED_ARTIFACT.graph,
				phases: { createMs: 200, initMs: 600, moduleInitMs: 200 },
				startupMs: 1000,
			},
		};
		mount(artifact);
		act(() => {
			container
				.querySelector<HTMLElement>(".boot-phases .boot-phase:nth-child(2)")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		const win = container.querySelector<HTMLElement>(".boot-minimap-window");
		expect(win?.style.left).toBe("14.139%");
		expect(win?.style.width).toBe("16%");
	});

	it("names a third-party module group instead of the unattributed bucket", () => {
		mount(EXTERNAL_ARTIFACT);
		const rows = container.querySelector(".boot-rows");
		expect(rows?.innerHTML).toContain('data-group="TypeOrmModule"');
		expect(rows?.innerHTML).not.toContain("unattributed");
		expect(container.querySelector(".boot-rows .boot-count")?.textContent).toBe(
			"1"
		);
	});

	it("selects an external row and names its module on hover", () => {
		mount(EXTERNAL_ARTIFACT);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"]')
				?.dispatchEvent(
					new MouseEvent("click", { bubbles: true, composed: true })
				);
		});
		expect(
			container
				.querySelector('.boot-rows [data-id="ta"]')
				?.classList.contains("boot-selected")
		).toBe(true);
		act(() => {
			container
				.querySelector<HTMLElement>('.boot-rows [data-id="ta"] .boot-bar')
				?.dispatchEvent(
					new MouseEvent("mousemove", {
						bubbles: true,
						clientX: 40,
						clientY: 30,
					})
				);
		});
		const card = container.querySelector<HTMLElement>(".hover-card");
		expect(card?.hidden).toBe(false);
		expect(card?.textContent).toContain(
			"TypeOrmModule · imported by UsersModule"
		);
	});

	it("shows a crosshair with a time chip while the mouse moves", () => {
		mount(TIMED_ARTIFACT);
		const main = container.querySelector<HTMLElement>(".boot-main");
		expect(main).not.toBeNull();
		const cursor = container.querySelector<HTMLElement>(".boot-cursor");
		expect(cursor?.style.display).not.toBe("block");
		act(() => {
			main?.dispatchEvent(
				new MouseEvent("mousemove", { bubbles: true, clientX: 0 })
			);
		});
		expect(cursor?.style.display).toBe("block");
		const chip = container.querySelector(".boot-cursor .boot-cursor-chip");
		expect(chip?.textContent).toBe("<1ms");
		act(() => {
			main?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
		});
		expect(cursor?.style.display).toBe("none");
	});
});
