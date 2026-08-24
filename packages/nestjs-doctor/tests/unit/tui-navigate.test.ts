import { describe, expect, it } from "vitest";
import { groupFindings } from "../../src/cli/interactive/findings.js";
import {
	buildListRows,
	clampOffset,
	flattenFindings,
	listCapacity,
	moveSelection,
	scrollWindow,
} from "../../src/cli/interactive/tui/navigate.js";
import type { Diagnostic } from "../../src/common/diagnostic.js";

const diagnostic = (
	rule: string,
	severity: Diagnostic["severity"]
): Diagnostic => ({
	category: rule.split("/")[0] as Diagnostic["category"],
	filePath: "src/app.service.ts",
	help: "help",
	message: "message",
	rule,
	severity,
});

const groups = groupFindings([
	diagnostic("security/secret", "error"),
	diagnostic("security/secret", "error"),
	diagnostic("architecture/orphan", "warning"),
	diagnostic("performance/nested-controller", "info"),
]);

describe("flattenFindings", () => {
	it("addresses every diagnostic by group and position", () => {
		const flat = flattenFindings(groups);
		expect(flat).toHaveLength(4);
		expect(flat[0]).toEqual({ groupIndex: 0, position: 0 });
		expect(flat[1]).toEqual({ groupIndex: 0, position: 1 });
		expect(flat[3]).toEqual({ groupIndex: 2, position: 0 });
	});
});

describe("moveSelection", () => {
	const flat = flattenFindings(groups);

	it("steps one finding in both directions and stops at the ends", () => {
		expect(moveSelection(flat, 1, -1)).toBe(0);
		expect(moveSelection(flat, 0, -1)).toBe(0);
		expect(moveSelection(flat, 2, 1)).toBe(3);
		expect(moveSelection(flat, 3, 1)).toBe(3);
	});

	it("jumps to the nearest finding of the neighbouring rule group", () => {
		expect(moveSelection(flat, 0, "group-next")).toBe(2);
		expect(moveSelection(flat, 3, "group-prev")).toBe(2);
		expect(moveSelection(flat, 0, "group-prev")).toBe(0);
	});
});

describe("scrollWindow", () => {
	it("follows the selection out of view", () => {
		expect(scrollWindow(0, 5, 4)).toBe(2);
		expect(scrollWindow(4, 0, 4)).toBe(0);
	});

	it("keeps the offset while the selection stays visible", () => {
		expect(scrollWindow(2, 3, 4)).toBe(2);
	});
});

describe("listCapacity", () => {
	it("gives the list what the terminal has left after the fixed chrome", () => {
		expect(listCapacity(40, 21, 3)).toBe(19);
	});

	it("keeps a floor so a tiny terminal still shows some rows", () => {
		expect(listCapacity(12, 21, 3)).toBe(3);
	});
});

describe("clampOffset", () => {
	it("keeps the window inside the list", () => {
		expect(clampOffset(-4, 20, 8)).toBe(0);
		expect(clampOffset(99, 20, 8)).toBe(12);
		expect(clampOffset(3, 20, 8)).toBe(3);
	});

	it("collapses to the top when everything fits", () => {
		expect(clampOffset(5, 8, 8)).toBe(0);
	});
});

describe("buildListRows", () => {
	it("inserts a category caption whenever the category changes", () => {
		const rows = buildListRows(groups);
		expect(rows).toEqual([
			{ kind: "category", label: "security" },
			{ groupIndex: 0, kind: "group" },
			{ kind: "category", label: "architecture" },
			{ groupIndex: 1, kind: "group" },
			{ kind: "category", label: "performance" },
			{ groupIndex: 2, kind: "group" },
		]);
	});

	it("caps each category at one caption even when it reappears", () => {
		const mixed = groupFindings([
			diagnostic("security/secret", "error"),
			diagnostic("architecture/orphan", "warning"),
			diagnostic("security/guards", "warning"),
		]);
		const rows = buildListRows(mixed);
		expect(rows).toEqual([
			{ kind: "category", label: "security" },
			{ groupIndex: 0, kind: "group" },
			{ kind: "category", label: "architecture" },
			{ groupIndex: 1, kind: "group" },
			{ groupIndex: 2, kind: "group" },
		]);
	});

	it("does not caption custom rules", () => {
		const custom = groupFindings([diagnostic("custom/team-rule", "info")]);
		expect(buildListRows(custom)).toEqual([{ groupIndex: 0, kind: "group" }]);
	});
});
