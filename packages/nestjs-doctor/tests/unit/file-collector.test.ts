import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFiles } from "../../src/core/file-collector.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("file-collector", () => {
	it("collects .ts files from basic-app", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		expect(files.length).toBeGreaterThan(0);
		expect(files.every((f) => f.endsWith(".ts"))).toBe(true);
	});

	it("excludes node_modules and dist by default", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
		expect(files.every((f) => !f.includes("dist"))).toBe(true);
	});

	it("returns sorted file list", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		const sorted = [...files].sort();
		expect(files).toEqual(sorted);
	});
});
