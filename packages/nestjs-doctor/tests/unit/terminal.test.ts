import { describe, expect, it } from "vitest";
import { usableColumns, usableRows } from "../../src/ui/terminal.js";

describe("usableColumns", () => {
	it("keeps a real width", () => {
		expect(usableColumns(120)).toBe(120);
	});

	it("replaces the zero a sizeless pty reports", () => {
		expect(usableColumns(0)).toBe(80);
	});

	it("replaces a width the stream never set", () => {
		expect(usableColumns(undefined)).toBe(80);
	});
});

describe("usableRows", () => {
	it("keeps a real height", () => {
		expect(usableRows(50)).toBe(50);
	});

	it("replaces the zero a sizeless pty reports", () => {
		expect(usableRows(0)).toBe(24);
	});

	it("replaces a height the stream never set", () => {
		expect(usableRows(undefined)).toBe(24);
	});
});
