import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dependencyLine } from "../../src/engine/advisories/installed.js";

const roots: string[] = [];

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const lineOf = (text: string, block: string, name: string): number => {
	const dir = mkdtempSync(join(tmpdir(), "nd-depline-"));
	roots.push(dir);
	const path = join(dir, "package.json");
	writeFileSync(path, text);
	return dependencyLine(path, block, name);
};

const MANIFEST = {
	name: "x",
	dependencies: { express: "^4.0.0", "@nestjs/core": "^10.0.0" },
	devDependencies: { "@nestjs/core": "^11.0.0" },
};

describe("dependencyLine", () => {
	it.each([
		["two spaces", JSON.stringify(MANIFEST, null, 2)],
		["four spaces", JSON.stringify(MANIFEST, null, 4)],
		["tabs", JSON.stringify(MANIFEST, null, "\t")],
	])("finds both blocks with %s", (_name, text) => {
		expect(lineOf(text, "dependencies", "@nestjs/core")).toBe(5);
		expect(lineOf(text, "devDependencies", "@nestjs/core")).toBe(8);
	});

	it("finds a key in a manifest with no indentation", () => {
		const text = '{\n"dependencies": {\n"@nestjs/core": "^10.0.0"\n}\n}';

		expect(lineOf(text, "dependencies", "@nestjs/core")).toBe(3);
	});

	it("skips a nested block that shares the name", () => {
		const text = [
			"{",
			'  "pnpm": {',
			'    "dependencies": {',
			'      "other": "1.0.0"',
			"    }",
			"  },",
			'  "dependencies": {',
			'    "@nestjs/core": "^10.0.0"',
			"  }",
			"}",
		].join("\n");

		expect(lineOf(text, "dependencies", "@nestjs/core")).toBe(8);
	});

	it("falls back to line 1 when the package is absent", () => {
		const text = JSON.stringify(
			{ dependencies: { express: "^4.0.0" } },
			null,
			2
		);

		expect(lineOf(text, "dependencies", "@nestjs/core")).toBe(1);
	});

	it("falls back to line 1 for a manifest on one line", () => {
		expect(
			lineOf(JSON.stringify(MANIFEST), "dependencies", "@nestjs/core")
		).toBe(1);
	});

	it("falls back to line 1 when the file cannot be read", () => {
		expect(dependencyLine("/nope/package.json", "dependencies", "x")).toBe(1);
	});
});
