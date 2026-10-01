import { describe, expect, it } from "vitest";
import { buildMenuItems } from "../../src/cli/interactive/tui/score-screen.js";

const actions = (
	findingCount: number,
	offerCi: boolean,
	offerInit: boolean,
	offerHook = false,
	recommended: "action" | "hook" | "skill" | null = null
): string[] =>
	buildMenuItems(
		findingCount,
		1,
		offerCi,
		offerInit,
		offerHook,
		recommended
	).map((item) => item.action);

describe("buildMenuItems", () => {
	it("opens with the recurring triggers, then this scan's actions behind More", () => {
		expect(actions(3, true, true, true)).toEqual([
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
		const items = buildMenuItems(3, 1, false, false, false, null, true);

		expect(items.map((item) => item.action)).toEqual([
			"handoff",
			"review",
			"report",
			"markdown",
			"share",
			"quit",
		]);
	});

	it("keeps the skill item when the workflow already exists", () => {
		expect(actions(0, false, true)).toEqual(["init", "report", "more", "quit"]);
	});

	it("heads each group once", () => {
		const items = buildMenuItems(3, 1, true, true, true, "action");

		expect(items.map((item) => item.section)).toEqual([
			"Keep it running",
			undefined,
			undefined,
			"This scan",
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	it("hides the skill item once it is installed for a detected agent", () => {
		expect(actions(3, true, false)).not.toContain("init");
	});

	it("moves the recommended trigger first and badges only that one", () => {
		const items = buildMenuItems(0, 0, true, true, true, "hook");
		const triggers = items.filter((item) =>
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
		const first = (offer: "action" | "hook" | "skill"): string | undefined =>
			buildMenuItems(0, 0, true, true, true, offer).find(
				(item) => item.badge === "Recommended"
			)?.action;

		expect(first("action")).toBe("ci");
		expect(first("hook")).toBe("hook");
		expect(first("skill")).toBe("init");
	});

	it("badges nothing when the recommended trigger is not offered", () => {
		const items = buildMenuItems(0, 0, true, true, false, "hook");

		expect(items.every((item) => item.badge === undefined)).toBe(true);
	});

	it("says what each trigger does for the user", () => {
		const labels = buildMenuItems(3, 1, true, true, true, null).map(
			(item) => item.label
		);

		expect(labels).toContain("Review every pull request");
		expect(labels).toContain("Check every commit");
		expect(labels).toContain("Rescan after every agent edit");
		expect(labels).toContain("Fix issues with AI");
	});
});
