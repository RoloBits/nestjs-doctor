import { describe, expect, it } from "vitest";
import { buildMenuItems } from "../../src/cli/interactive/tui/score-screen.js";

const actions = (
	findingCount: number,
	offerCi: boolean,
	offerInit: boolean
): string[] =>
	buildMenuItems(findingCount, 1, offerCi, offerInit).map(
		(item) => item.action
	);

describe("buildMenuItems", () => {
	it("offers the agent skill right after the CI item", () => {
		expect(actions(3, true, true)).toEqual([
			"review",
			"report",
			"handoff",
			"ci",
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

	it("labels the skill item as the run-after-every-change step", () => {
		const item = buildMenuItems(0, 0, false, true).find(
			(candidate) => candidate.action === "init"
		);
		expect(item?.label).toBe(
			"Run after every change (install the agent skill)"
		);
	});
});
