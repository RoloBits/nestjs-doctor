import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dist = join(import.meta.dirname, "../dist/report-ui.js");

// The IIFE runs in browsers; a stray process reference kills the whole
// bundle before NDReport is assigned (shipped once as a black screen).
describe("built bundle", () => {
	it("carries no bare process.env references", () => {
		let js: string;
		try {
			js = readFileSync(dist, "utf8");
		} catch {
			console.warn(
				"dist/report-ui.js missing; run pnpm --filter report-ui build"
			);
			return;
		}
		expect(js.includes("process.env")).toBe(false);
	});
});
