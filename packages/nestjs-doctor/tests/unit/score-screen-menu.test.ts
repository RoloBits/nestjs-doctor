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
	it("offers the three recurring triggers after the handoff item", () => {
		expect(actions(3, true, true, true)).toEqual([
			"review",
			"report",
			"handoff",
			"ci",
			"hook",
			"init",
			"markdown",
			"share",
			"quit",
		]);
	});

	it("keeps the skill item when the workflow already exists", () => {
		expect(actions(0, false, true)).toEqual([
			"report",
			"init",
			"markdown",
			"share",
			"quit",
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

	it("badges nothing when the recommended trigger is not offered", () => {
		const items = buildMenuItems(0, 0, true, true, false, "hook");

		expect(items.every((item) => item.badge === undefined)).toBe(true);
	});

	it("says what each trigger does for the user", () => {
		const labels = buildMenuItems(0, 0, true, true, true, null).map(
			(item) => item.label
		);

		expect(labels).toContain("Review every pull request");
		expect(labels).toContain("Check every commit");
		expect(labels).toContain("Rescan after every agent edit");
	});
});
