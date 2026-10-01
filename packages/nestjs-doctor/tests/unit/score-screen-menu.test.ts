import { describe, expect, it } from "vitest";
import {
	buildMenuItems,
	type MenuOptions,
} from "../../src/cli/interactive/tui/score-screen.js";

const menu = (overrides: Partial<MenuOptions> = {}) =>
	buildMenuItems({
		findingCount: 3,
		hookTool: "husky",
		offerCi: true,
		offerHook: true,
		offerInit: true,
		recommended: null,
		ruleCount: 1,
		showMore: false,
		...overrides,
	});

const actions = (overrides: Partial<MenuOptions> = {}): string[] =>
	menu(overrides).map((item) => item.action);

describe("buildMenuItems", () => {
	it("opens with the recurring triggers, then this scan's actions behind More", () => {
		expect(actions()).toEqual([
			"ci",
			"hook",
			"init",
			"handoff",
			"review",
			"report",
			"more",
			"quit",
		]);
	});

	it("unfolds markdown and share in place of More", () => {
		expect(
			actions({
				offerCi: false,
				offerHook: false,
				offerInit: false,
				showMore: true,
			})
		).toEqual(["handoff", "review", "report", "markdown", "share", "quit"]);
	});

	it("drops the finding rows on a clean scan", () => {
		expect(
			actions({ findingCount: 0, offerCi: false, offerHook: false })
		).toEqual(["init", "report", "more", "quit"]);
	});

	it("moves the recommended trigger first and badges only that one", () => {
		const triggers = menu({ recommended: "hook" }).filter((item) =>
			["ci", "hook", "init"].includes(item.action)
		);

		expect(triggers.map((item) => item.action)).toEqual(["hook", "ci", "init"]);
		expect(triggers.map((item) => item.badge)).toEqual([
			"Recommended",
			undefined,
			undefined,
		]);
	});

	it("maps every offer onto its menu item", () => {
		const first = (recommended: MenuOptions["recommended"]) =>
			menu({ recommended }).find((item) => item.badge === "Recommended")
				?.action;

		expect(first("action")).toBe("ci");
		expect(first("hook")).toBe("hook");
		expect(first("skill")).toBe("init");
	});

	it("badges nothing when the recommended trigger is not offered", () => {
		expect(
			menu({ offerHook: false, recommended: "hook" }).every(
				(item) => item.badge === undefined
			)
		).toBe(true);
	});

	it("heads each group once", () => {
		expect(menu({ recommended: "action" }).map((item) => item.section)).toEqual(
			[
				"Keep it running",
				undefined,
				undefined,
				"This scan",
				undefined,
				undefined,
				undefined,
				undefined,
			]
		);
	});

	it("says what each row does to the repo", () => {
		const hints = Object.fromEntries(
			menu().map((item) => [item.action, item.hint])
		);

		expect(hints.ci).toBe("Adds a PR-commenting workflow");
		expect(hints.hook).toBe("Edits .husky/pre-commit");
		expect(
			menu({ hookTool: "lefthook" }).find((item) => item.action === "hook")
				?.hint
		).toBe("Shows a snippet to paste");
		expect(menu().find((item) => item.action === "handoff")?.label).toBe(
			"Fix issues with your agent"
		);
	});
});
