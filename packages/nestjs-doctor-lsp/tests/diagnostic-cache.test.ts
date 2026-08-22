import { describe, expect, it } from "vitest";
import {
	DiagnosticCache,
	isMissingAnalyzer,
	toCacheKey,
} from "../src/diagnostic-cache.js";

const at = (filePath: string, message = "finding") => ({ filePath, message });

describe("toCacheKey", () => {
	it("leaves a posix path alone", () => {
		expect(toCacheKey("/proj/src/a.ts")).toBe("/proj/src/a.ts");
	});

	it("spells a native Windows path the way the scanner does", () => {
		expect(toCacheKey("D:\\proj\\src\\a.ts")).toBe("d:/proj/src/a.ts");
	});

	it("agrees with itself across both spellings of the same file", () => {
		expect(toCacheKey("D:\\proj\\src\\a.ts")).toBe(
			toCacheKey("D:/proj/src/a.ts")
		);
	});

	it("folds the drive letter, which the editor and the scanner disagree on", () => {
		expect(toCacheKey("c:/proj/a.ts")).toBe(toCacheKey("C:/proj/a.ts"));
	});

	it("does not fold anything else, since posix paths are case sensitive", () => {
		expect(toCacheKey("/proj/A.ts")).not.toBe(toCacheKey("/proj/a.ts"));
	});
});

describe("DiagnosticCache", () => {
	it("returns file findings followed by the project-wide ones", () => {
		const cache = new DiagnosticCache();
		cache.set("/proj/a.ts", [at("/proj/a.ts", "one")]);
		cache.set("/proj/b.ts", [at("/proj/b.ts", "two")]);

		expect(cache.withProject([at("", "cycle")])).toEqual([
			at("/proj/a.ts", "one"),
			at("/proj/b.ts", "two"),
			at("", "cycle"),
		]);
	});

	it("groups a full scan by file", () => {
		const cache = new DiagnosticCache();
		cache.replaceAll([
			at("/proj/a.ts", "one"),
			at("/proj/a.ts", "two"),
			at("/proj/b.ts", "three"),
		]);

		expect(cache.size).toBe(2);
		expect(cache.withProject([])).toHaveLength(3);
	});

	it("drops the previous scan rather than adding to it", () => {
		const cache = new DiagnosticCache();
		cache.replaceAll([at("/proj/a.ts", "stale")]);
		cache.replaceAll([at("/proj/b.ts", "fresh")]);

		expect(cache.withProject([])).toEqual([at("/proj/b.ts", "fresh")]);
	});

	it("replaces a file's findings on edit instead of appending", () => {
		const cache = new DiagnosticCache();
		cache.replaceAll([at("/proj/a.ts", "before")]);
		cache.set("/proj/a.ts", [at("/proj/a.ts", "after")]);

		expect(cache.withProject([])).toEqual([at("/proj/a.ts", "after")]);
	});

	it("treats a native edit path as the file the scan already stored", () => {
		// The full scan keys by the scanner's forward-slash path, the edit by the
		// editor's native one. Two entries here means every finding in the file
		// shows twice on Windows, with the pre-edit set never clearing.
		const cache = new DiagnosticCache();
		cache.replaceAll([at("D:/proj/src/a.ts", "before")]);
		cache.set("D:\\proj\\src\\a.ts", [at("D:/proj/src/a.ts", "after")]);

		expect(cache.size).toBe(1);
		expect(cache.withProject([])).toEqual([at("D:/proj/src/a.ts", "after")]);
	});

	it("empties on clear", () => {
		const cache = new DiagnosticCache();
		cache.replaceAll([at("/proj/a.ts")]);
		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.withProject([at("", "cycle")])).toEqual([at("", "cycle")]);
	});
});

describe("isMissingAnalyzer", () => {
	it("recognises the workspace not having nestjs-doctor installed", () => {
		expect(isMissingAnalyzer("Cannot find module 'nestjs-doctor'")).toBe(true);
	});

	it("recognises the double-quoted spelling some Node versions emit", () => {
		expect(isMissingAnalyzer('Cannot find module "nestjs-doctor"')).toBe(true);
	});

	it("does not swallow a different module going missing", () => {
		expect(isMissingAnalyzer("Cannot find module 'ts-morph'")).toBe(false);
	});

	it("does not swallow a real fault, which the user needs to see", () => {
		expect(isMissingAnalyzer("Unexpected token in tsconfig.json")).toBe(false);
	});
});
