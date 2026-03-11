import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadPathAliases,
	type PathAliasMap,
	resolvePathAlias,
} from "../../src/engine/graph/tsconfig-paths.js";

describe("resolvePathAlias", () => {
	it("resolves wildcard pattern correctly", () => {
		const aliases: PathAliasMap = new Map([["@app/*", ["/project/src/*"]]]);
		expect(resolvePathAlias("@app/users/service", aliases)).toBe(
			"/project/src/users/service"
		);
	});

	it("resolves exact match pattern", () => {
		const aliases: PathAliasMap = new Map([
			["@config", ["/project/src/config/index.ts"]],
		]);
		expect(resolvePathAlias("@config", aliases)).toBe(
			"/project/src/config/index.ts"
		);
	});

	it("returns undefined for non-matching specifier", () => {
		const aliases: PathAliasMap = new Map([["@app/*", ["/project/src/*"]]]);
		expect(resolvePathAlias("@other/foo", aliases)).toBeUndefined();
	});

	it("returns undefined with empty map", () => {
		const aliases: PathAliasMap = new Map();
		expect(resolvePathAlias("@app/foo", aliases)).toBeUndefined();
	});

	it("resolves first target when multiple targets exist", () => {
		const aliases: PathAliasMap = new Map([
			["@libs/*", ["/project/src/libs/*", "/project/src/shared/*"]],
		]);
		expect(resolvePathAlias("@libs/auth", aliases)).toBe(
			"/project/src/libs/auth"
		);
	});

	it("skips patterns with empty targets", () => {
		const aliases: PathAliasMap = new Map([
			["@empty/*", []],
			["@app/*", ["/project/src/*"]],
		]);
		expect(resolvePathAlias("@app/foo", aliases)).toBe("/project/src/foo");
	});
});

describe("loadPathAliases", () => {
	const fixtureDir = resolve(import.meta.dirname, "../fixtures/tsconfig-paths");

	it("loads path aliases from fixture tsconfig", () => {
		const aliases = loadPathAliases(fixtureDir);
		expect(aliases.size).toBe(3);
		expect(aliases.has("@app/*")).toBe(true);
		expect(aliases.has("@libs/*")).toBe(true);
		expect(aliases.has("@config")).toBe(true);

		// baseUrl is ./src, so targets should resolve to <fixture>/src/*
		const appTargets = aliases.get("@app/*")!;
		expect(appTargets[0]).toBe(resolve(fixtureDir, "src", "*"));

		const libsTargets = aliases.get("@libs/*")!;
		expect(libsTargets[0]).toBe(resolve(fixtureDir, "src", "libs", "*"));
	});

	it("returns empty map for nonexistent path", () => {
		const aliases = loadPathAliases("/nonexistent/path/that/does/not/exist");
		expect(aliases.size).toBe(0);
	});

	it("returns empty map for directory without tsconfig", () => {
		// Use a directory that exists but has no tsconfig.json
		const aliases = loadPathAliases("/tmp");
		expect(aliases.size).toBe(0);
	});
});
