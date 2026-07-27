import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../src/common/config.js";
import {
	findConfig,
	loadConfigWithFallback,
} from "../../src/engine/config/loader.js";

const tempRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "nestjs-doctor-config-inherit-")
);

afterAll(() => {
	fs.rmSync(tempRoot, { recursive: true, force: true });
});

const makeDir = (name: string): string => {
	const dir = path.join(tempRoot, name);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
};

const rootConfig: NestjsDoctorConfig = {
	ignore: { rules: ["security/no-synchronize-in-production"] },
	minScore: 80,
};

describe("findConfig", () => {
	it("returns null when a directory declares no config", async () => {
		await expect(findConfig(makeDir("silent"))).resolves.toBeNull();
	});

	it("returns the config a directory does declare", async () => {
		const dir = makeDir("declared");
		fs.writeFileSync(
			path.join(dir, "nestjs-doctor.config.json"),
			JSON.stringify({ minScore: 42 })
		);
		await expect(findConfig(dir)).resolves.toMatchObject({ minScore: 42 });
	});

	it("distinguishes a package.json without the key from one with it", async () => {
		const bare = makeDir("bare-pkg");
		fs.writeFileSync(
			path.join(bare, "package.json"),
			JSON.stringify({ name: "bare" })
		);
		await expect(findConfig(bare)).resolves.toBeNull();

		const keyed = makeDir("keyed-pkg");
		fs.writeFileSync(
			path.join(keyed, "package.json"),
			JSON.stringify({ name: "keyed", "nestjs-doctor": { minScore: 55 } })
		);
		await expect(findConfig(keyed)).resolves.toMatchObject({ minScore: 55 });
	});
});

describe("loadConfigWithFallback", () => {
	it("inherits the root config when a sub-project declares none", async () => {
		// Regression: `loadConfig` swallows a missing file and returns the
		// defaults instead of throwing, so the previous try/catch fallback never
		// fired and a monorepo's root config was silently dropped for every
		// sub-project (issue #109).
		const sub = makeDir("sub-without-config");
		await expect(loadConfigWithFallback(sub, rootConfig)).resolves.toEqual(
			rootConfig
		);
	});

	it("lets a sub-project's own config win over the root's", async () => {
		const sub = makeDir("sub-with-config");
		fs.writeFileSync(
			path.join(sub, "nestjs-doctor.config.json"),
			JSON.stringify({ minScore: 10 })
		);
		const resolved = await loadConfigWithFallback(sub, rootConfig);
		expect(resolved.minScore).toBe(10);
		expect(resolved.ignore).toBeUndefined();
	});

	it("inherits the root config for a sub-project that has only a package.json", async () => {
		const sub = makeDir("sub-plain-pkg");
		fs.writeFileSync(
			path.join(sub, "package.json"),
			JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "^11" } })
		);
		await expect(loadConfigWithFallback(sub, rootConfig)).resolves.toEqual(
			rootConfig
		);
	});
});
